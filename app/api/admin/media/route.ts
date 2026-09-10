import { audit, bucket, cleanInt, cleanText, db } from "../../../../lib/cms-db";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { SERVER_MAX_PART_BYTES } from "../../../../lib/upload-limits";

export const dynamic = "force-dynamic";

// Les trois budgets de taille (cible client, plafond serveur, limite
// plateforme) vivent dans lib/upload-limits.ts avec une marge documentée et
// testée (tests/upload-limits.test.ts) — voir AUDIT_DIVINE_MOTION.md, risque
// #3 : la marge précédente (60 Ko) était insuffisante.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const VARIANTS = new Set(["thumbnail", "mobile", "desktop", "original"]);

function validUploadId(value: string) {
  return /^[a-zA-Z0-9-]{20,80}$/.test(value);
}

function extension(file: File) {
  if (file.type === "image/webp") return ".webp";
  const suffix = file.name.includes(".") ? file.name.split(".").pop() : "";
  return suffix ? `.${suffix!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
}

async function removeObjects(keys: Array<string | null | undefined>) {
  await Promise.all(keys.filter(Boolean).map((key) => bucket().delete(key!)));
}

// Instrumentation minimale : pas de contenu de fichier, pas d'e-mail, pas de
// nom original — uniquement de quoi savoir à quelle étape un échec se
// produit (validation / r2 / d1 / réponse), demandé par la correction 3.F.
function logStage(stage: string, details: Record<string, unknown> = {}) {
  console.log("[media-upload]", stage, details);
}

/**
 * Nettoyage best-effort des objets R2 déjà écrits lorsque le pipeline
 * d'upload échoue en cours de séquence côté client (ex. la variante
 * "desktop" a été stockée avec succès mais "original" échoue ensuite). Sans
 * cela, ces objets restent orphelins dans R2 sans jamais être référencés par
 * D1 — le scénario de "média fantôme" identifié par l'audit (correctif
 * Phase 1 #3.E). Le client appelle ce chemin depuis son propre bloc catch
 * (voir app/admin/media-library.tsx) ; c'est une best-effort, pas une
 * garantie transactionnelle complète (un crash total du navigateur avant
 * l'appel reste un cas résiduel documenté dans TEST_REPORT_PHASE1.md).
 */
async function handleAbortUpload(payload: Record<string, unknown>) {
  const uploadId = cleanText(payload.uploadId, 80);
  if (!validUploadId(uploadId)) return Response.json({ ok: false }, { status: 400 });

  const prefixes = [`images/${uploadId}-`, `videos/${uploadId}-`];
  const keys = Array.isArray(payload.keys) ? payload.keys.slice(0, 8) : [];
  const safeKeys = keys.filter(
    (key: unknown): key is string =>
      typeof key === "string" && !key.includes("..") && prefixes.some((prefix) => key.startsWith(prefix)),
  );

  logStage("abort-upload", { uploadId, keyCount: safeKeys.length });
  await removeObjects(safeKeys).catch((error) => console.error("[media-upload] abort cleanup failed", error));
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  let cleanupKeys: string[] = [];
  let stage = "authentication";
  try {
    const user = await requireAdminApi();
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = (await request.json()) as any;
      if (payload.action === "abort-upload") return handleAbortUpload(payload);

      stage = "external-video";
      const url = cleanText(payload.url, 1200);
      if (!/^https:\/\//i.test(url))
        return Response.json({ error: "Une URL HTTPS valide est requise" }, { status: 400 });
      const title = cleanText(payload.title, 180) || "Vidéo externe";
      const result = await db()
        .prepare("INSERT INTO media (name,title,caption,category,type,mime_type,description,alt_text,external_url,custom_thumbnail_media_id,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(title,title,cleanText(payload.caption,500),"video","external_video","text/url",cleanText(payload.description,1000),cleanText(payload.altText,300),url,payload.thumbnailMediaId?cleanInt(payload.thumbnailMediaId):null,user.email)
        .run();
      const id = Number(result.meta.last_row_id);
      await audit("media",String(id),"create","Vidéo externe ajoutée",user.email).catch((error)=>console.error("[media-upload] audit failed",error));
      return Response.json({ ok: true, id }, { status: 201 });
    }

    stage = "multipart-parse";
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Fichier manquant" }, { status: 400 });

    const sourceMime = cleanText(form.get("sourceMime"), 100) || file.type;
    const isVideo = sourceMime.startsWith("video/");
    if (!(isVideo ? VIDEO_TYPES : IMAGE_TYPES).has(sourceMime) || !(IMAGE_TYPES.has(file.type) || VIDEO_TYPES.has(file.type))) {
      logStage("rejected-format", { mime: file.type, sourceMime });
      return Response.json({ error: "Format non supporté. Utilisez JPEG, PNG, WebP, GIF, MP4, WebM ou MOV." }, { status: 415 });
    }
    if (file.size > SERVER_MAX_PART_BYTES) {
      logStage("rejected-size", { bytes: file.size, limit: SERVER_MAX_PART_BYTES });
      return Response.json(
        {
          error: isVideo
            ? "Vidéo trop volumineuse pour l’envoi direct. Utilisez YouTube ou Vimeo."
            : "Image trop volumineuse après optimisation.",
        },
        { status: 413 },
      );
    }

    const uploadId = cleanText(form.get("uploadId"), 80);
    const variant = cleanText(form.get("variant"), 20);
    const mode = cleanText(form.get("mode"), 20);
    if (!validUploadId(uploadId) || !VARIANTS.has(variant) || !["variant", "finalize"].includes(mode))
      return Response.json({ error: "Session de téléversement invalide. Veuillez réessayer." }, { status: 400 });

    const folder = isVideo ? "videos" : "images";
    const key = `${folder}/${uploadId}-${variant}${extension(file)}`;
    stage = `r2-${variant}`;
    logStage(stage, { uploadId, variant, bytes: file.size });
    await bucket().put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: cleanText(form.get("name"),180)||file.name, uploadedBy:user.email, variant },
    });
    cleanupKeys.push(key);

    if (mode === "variant") return Response.json({ ok:true,key,state:"stored" }, { status:201 });

    stage = "variant-validation";
    let supplied: Record<string,string> = {};
    try { supplied = JSON.parse(cleanText(form.get("variantKeys"),3000)||"{}"); }
    catch { return Response.json({ error:"Références de variantes invalides." }, { status:400 }); }
    const expectedPrefix = `${folder}/${uploadId}-`;
    for (const name of ["thumbnail","mobile","desktop"]) {
      const value = supplied[name];
      if (value && (!value.startsWith(expectedPrefix) || value.includes("..")))
        return Response.json({ error:"Références de variantes invalides." }, { status:400 });
      if (value) cleanupKeys.push(value);
    }

    const width = cleanInt(form.get("width")), height = cleanInt(form.get("height")), replaceId = cleanInt(form.get("replaceId"));
    const name = cleanText(form.get("name"),180)||file.name, category = cleanText(form.get("category"),30)||(isVideo?"video":"photo");
    const old = replaceId ? await db().prepare("SELECT original_key,thumbnail_key,mobile_key,desktop_key FROM media WHERE id=?").bind(replaceId).first<Record<string,string>>() : null;

    stage = "d1-metadata";
    logStage(stage, { uploadId, replaceId: Boolean(replaceId) });
    let id = replaceId;
    if (replaceId) {
      const result = await db().prepare("UPDATE media SET name=?,category=?,type=?,mime_type=?,original_key=?,thumbnail_key=?,mobile_key=?,desktop_key=?,width=?,height=?,size_bytes=?,deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(name,category,isVideo?"video":"image",file.type,key,supplied.thumbnail||key,supplied.mobile||key,supplied.desktop||key,width||null,height||null,cleanInt(form.get("sourceSize"),file.size),replaceId).run();
      if (!result.meta.changes) throw new Error("Le média à remplacer est introuvable.");
    } else {
      const result = await db().prepare("INSERT INTO media (name,title,category,type,mime_type,original_key,thumbnail_key,mobile_key,desktop_key,width,height,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(name,name,category,isVideo?"video":"image",file.type,key,supplied.thumbnail||key,supplied.mobile||key,supplied.desktop||key,width||null,height||null,cleanInt(form.get("sourceSize"),file.size),user.email).run();
      id = Number(result.meta.last_row_id);
    }

    // Le succès n'est déclaré qu'une fois la ligne D1 vérifiée récupérable
    // (id + clé de fichier), pas seulement après un `.run()` qui n'a pas
    // levé d'erreur — correction Phase 1 #3.E ("éviter les médias fantômes").
    stage = "d1-verify";
    const verification = await db()
      .prepare("SELECT id FROM media WHERE id=? AND original_key IS NOT NULL")
      .bind(id)
      .first<{ id: number }>();
    if (!verification) throw new Error("Le média a été reçu mais n’est pas encore récupérable. Réessayez.");

    cleanupKeys = [];
    if (old) {
      // Nettoyage best-effort des anciens objets R2 remplacés : son échec ne
      // doit jamais transformer un remplacement déjà réussi et vérifié en
      // échec signalé à l'admin (cf. AUDIT_DIVINE_MOTION.md, bug D4).
      const staleKeys = [old.original_key, old.thumbnail_key, old.mobile_key, old.desktop_key].filter(
        (value, index, list) => value && list.indexOf(value) === index,
      );
      await removeObjects(staleKeys).catch((error) =>
        console.error("[media-upload] stale object cleanup failed", {
          id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    await audit("media",String(id),replaceId?"replace":"upload",name,user.email).catch((error)=>console.error("[media-upload] audit failed",error));
    logStage("complete", { id, replaceId: Boolean(replaceId) });
    return Response.json({ ok:true,id,state:"complete" }, { status:replaceId?200:201 });
  } catch (error) {
    if (cleanupKeys.length) await removeObjects([...new Set(cleanupKeys)]).catch(()=>undefined);
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[media-upload] failed", { stage, message });
    const friendly = stage.startsWith("r2-")
      ? "Erreur de stockage du média."
      : stage === "d1-metadata" || stage === "d1-verify"
        ? "Le fichier a été reçu, mais ses informations n’ont pas pu être enregistrées."
        : "Échec du téléversement.";
    return Response.json({ error: friendly }, { status: 500 });
  }
}

export async function PATCH(request:Request){
  try{const user=await requireAdminApi(),payload=await request.json() as any,id=cleanInt(payload.id);if(!id)return Response.json({error:"Média invalide"},{status:400});await db().prepare("UPDATE media SET name=?,title=?,caption=?,category=?,description=?,alt_text=?,visible=?,project_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(cleanText(payload.name,180),cleanText(payload.title,180),cleanText(payload.caption,500),["photo","video","logo","other"].includes(payload.category)?payload.category:"other",cleanText(payload.description,1000),cleanText(payload.altText,300),payload.visible===false?0:1,payload.projectId?cleanInt(payload.projectId):null,id).run();await audit("media",String(id),"update","Métadonnées du média modifiées",user.email,payload);return Response.json({ok:true})}catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Erreur serveur"},{status:500})}
}
export async function DELETE(request:Request){
  try{const user=await requireAdminApi(),url=new URL(request.url),id=cleanInt(url.searchParams.get("id")),force=url.searchParams.get("force")==="1";if(!id)return Response.json({error:"Média invalide"},{status:400});const needle="%"+id+"%";const [projects,sections,settings]=await Promise.all([db().prepare("SELECT COUNT(*) total FROM projects WHERE deleted_at IS NULL AND (cover_media_id=? OR gallery_json LIKE ? OR videos_json LIKE ?)").bind(id,needle,needle).first(),db().prepare("SELECT COUNT(*) total FROM project_sections WHERE media_json LIKE ? OR videos_json LIKE ?").bind(needle,needle).first(),db().prepare("SELECT COUNT(*) total FROM cms_settings WHERE value LIKE ?").bind(needle).first()]);const used=Number(projects?.total||0)+Number(sections?.total||0)+Number(settings?.total||0);if(used&&!force)return Response.json({error:"Ce média est utilisé sur le site.",used},{status:409});await db().prepare("UPDATE media SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();await audit("media",String(id),"trash","Média placé dans la corbeille",user.email);return Response.json({ok:true})}catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Erreur serveur"},{status:500})}
}
