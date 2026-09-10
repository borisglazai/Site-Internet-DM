"use client";
import { FormEvent, useRef, useState } from "react";
import { formatBytes, MediaItem, MediaThumb } from "./media-picker";
import { CLIENT_TARGET_BYTES } from "../../lib/upload-limits";

type Props = { items: MediaItem[]; refresh: (query?: string, type?: string) => void; notice: (message: string) => void };

// "saving" correspond à l'intervalle entre "tous les octets de la dernière
// partie ont été envoyés" et "le serveur confirme l'écriture D1" — c'est
// précisément la fenêtre où l'upload restait auparavant bloqué "à 100 %"
// sans jamais se terminer (AUDIT_DIVINE_MOTION.md, correctif Phase 1 #3.C).
type UploadStatus = "uploading" | "processing" | "saving" | "done" | "error";
type UploadTask = { name: string; progress: number; status: UploadStatus; error?: string; file: File; replaceId?: number };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function MediaLibrary({ items, refresh, notice }: Props) {
  const [uploads, setUploads] = useState<Record<string, UploadTask>>({});
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [drag, setDrag] = useState(false);
  const [external, setExternal] = useState({ title: "", url: "", description: "" });
  const replacement = useRef<HTMLInputElement>(null);

  function updateTask(key: string, patch: Partial<UploadTask>) {
    setUploads((old) => ({ ...old, [key]: { ...old[key], ...patch } }));
  }

  async function upload(files: File[], replaceId?: number) {
    if (!files.length) return;
    for (const file of files) {
      const key = crypto.randomUUID();
      setUploads((old) => ({ ...old, [key]: { name: file.name, progress: 0, status: "uploading", file, replaceId } }));
      await uploadOne(file, key, replaceId);
    }
    setEditing(null);
    refresh(query, type);
  }

  async function retry(key: string) {
    const task = uploads[key];
    if (!task) return;
    updateTask(key, { progress: 0, status: "uploading", error: undefined });
    await uploadOne(task.file, key, task.replaceId);
    refresh(query, type);
  }

  async function uploadOne(original: File, taskKey: string, replaceId?: number) {
    const uploadId = crypto.randomUUID();
    // Clés R2 déjà confirmées par le serveur pour les variantes intermédiaires
    // (thumbnail/mobile/desktop) de cette séquence. Si une variante
    // ultérieure échoue, on les envoie au serveur pour nettoyage plutôt que
    // de laisser des objets R2 orphelins jamais référencés par D1.
    const stored: Record<string, string> = {};
    try {
      if (![...IMAGE_TYPES, ...VIDEO_TYPES].includes(original.type)) {
        throw new Error("Format non supporté. Utilisez JPEG, PNG, WebP, GIF, MP4, WebM ou MOV.");
      }
      if (original.type.startsWith("video/") && original.size > CLIENT_TARGET_BYTES) {
        throw new Error("Vidéo trop volumineuse pour l’envoi direct. Utilisez YouTube ou Vimeo.");
      }

      const prepared = original.type.startsWith("image/")
        ? await variants(original)
        : { files: { file: original } as Record<string, File>, width: 0, height: 0 };
      const parts = Object.entries(prepared.files).sort(([name]) => (name === "file" ? 1 : -1));

      for (let index = 0; index < parts.length; index++) {
        const [variant, file] = parts[index];
        if (file.size > CLIENT_TARGET_BYTES) throw new Error("Fichier trop volumineux après optimisation.");

        const final = variant === "file";
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("mode", final ? "finalize" : "variant");
        form.append("uploadId", uploadId);
        form.append("variant", final ? "original" : variant);
        form.append("sourceMime", original.type);
        form.append("sourceSize", String(original.size));
        form.append("name", original.name);
        form.append("width", String(prepared.width));
        form.append("height", String(prepared.height));
        form.append("category", original.type.startsWith("video/") ? "video" : "photo");
        form.append("variantKeys", JSON.stringify(stored));
        if (replaceId) form.append("replaceId", String(replaceId));

        const result = await xhr(
          form,
          (value) =>
            updateTask(taskKey, {
              progress: Math.min(100, Math.round(((index + value / 100) / parts.length) * 100)),
              status: "uploading",
            }),
          () => updateTask(taskKey, { progress: 100, status: final ? "saving" : "processing" }),
        );
        if (!final && result.key) stored[variant] = result.key;
      }

      updateTask(taskKey, { progress: 100, status: "done" });
      notice(replaceId ? "Fichier remplacé" : `${original.name} ajouté`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur serveur";
      updateTask(taskKey, { status: "error", error: message });
      notice(`Échec du téléversement — ${message}`);
      await abortUpload(uploadId, stored);
    }
  }

  async function save() {
    if (!editing) return;
    const response = await fetch("/api/admin/media", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editing.name,
        title: editing.title,
        caption: editing.caption,
        category: editing.category,
        description: editing.description,
        altText: editing.alt_text,
        visible: Boolean(editing.visible),
      }),
    });
    const json = await response.json();
    if (!response.ok) return notice(json.error || "Enregistrement impossible");
    setEditing(null);
    notice("Média enregistré");
    refresh(query, type);
  }

  async function trash(ids: number[]) {
    if (!ids.length) return;
    if (!confirm(`Placer ${ids.length} média${ids.length > 1 ? "s" : ""} dans la corbeille ?`)) return;
    for (const id of ids) {
      let response = await fetch(`/api/admin/media?id=${id}`, { method: "DELETE" });
      let json = await response.json();
      if (response.status === 409) {
        const item = items.find((value) => value.id === id);
        const where = (item?.usages || []).join("\n• ");
        if (!confirm(`Ce média est utilisé dans :\n• ${where || "le site"}\n\nLe placer malgré tout dans la corbeille ?`)) continue;
        response = await fetch(`/api/admin/media?id=${id}&force=1`, { method: "DELETE" });
        json = await response.json();
      }
      if (!response.ok) notice(json.error);
    }
    setSelected([]);
    notice("Média déplacé dans la corbeille");
    refresh(query, type);
  }

  async function addExternal(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(external),
    });
    const json = await response.json();
    if (!response.ok) return notice(json.error);
    setExternal({ title: "", url: "", description: "" });
    notice("Vidéo externe ajoutée");
    refresh(query, type);
  }

  function toggle(id: number) {
    setSelected((old) => (old.includes(id) ? old.filter((value) => value !== id) : [...old, id]));
  }

  return (
    <section>
      <div className="dm-page-title">
        <div>
          <p className="dm-kicker">Divine Motion CMS</p>
          <h1>Bibliothèque média</h1>
          <span>Le centre visuel de vos photos, vidéos, logos et fichiers réutilisables.</span>
        </div>
        <label className="dm-primary dm-upload">
          ＋ Téléverser
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files || []);
              event.currentTarget.value = "";
              upload(files);
            }}
          />
        </label>
      </div>
      <div className="dm-media-toolbar">
        <div className="dm-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un média…" />
          <button onClick={() => refresh(query, type)}>Rechercher</button>
        </div>
        <div className="dm-filter-pills">
          {[["", "Tous"], ["photo", "Photos"], ["video", "Vidéos"], ["logo", "Logos"], ["other", "Autres"]].map(([id, label]) => (
            <button className={type === id ? "active" : ""} key={id} onClick={() => { setType(id); refresh(query, id); }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {selected.length > 0 && (
        <div className="dm-bulkbar">
          <b>{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</b>
          <button onClick={() => setSelected(items.map((item) => item.id))}>Tout sélectionner</button>
          <button className="danger" onClick={() => trash(selected)}>Mettre à la corbeille</button>
          <button onClick={() => setSelected([])}>Annuler</button>
        </div>
      )}
      <div
        className={drag ? "dm-dropzone active" : "dm-dropzone"}
        onDragEnter={(event) => { event.preventDefault(); setDrag(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => { event.preventDefault(); setDrag(false); upload(Array.from(event.dataTransfer.files)); }}
      >
        <b>Glissez vos photos ou vidéos ici</b>
        <span>ou utilisez le bouton Téléverser · plusieurs fichiers acceptés</span>
      </div>
      {Object.entries(uploads).map(([key, task]) => (
        <div className={`dm-progress ${task.status}`} key={key}>
          <span>
            <b>{task.name}</b>
            <small>{statusLabel(task.status)}</small>
            {task.error && <em>{task.error}</em>}
          </span>
          <i><b style={{ width: `${task.progress}%` }} /></i>
          <strong>
            {task.status === "error" ? (
              <button onClick={() => retry(key)}>Réessayer</button>
            ) : task.status === "done" ? (
              "✓"
            ) : (
              `${task.progress}%`
            )}
          </strong>
        </div>
      ))}
      <details className="dm-video-details">
        <summary>Ajouter une vidéo YouTube, Vimeo ou externe</summary>
        <form className="dm-external-video" onSubmit={addExternal}>
          <input required placeholder="Titre" value={external.title} onChange={(e) => setExternal({ ...external, title: e.target.value })} />
          <input required type="url" placeholder="URL HTTPS" value={external.url} onChange={(e) => setExternal({ ...external, url: e.target.value })} />
          <button>Ajouter</button>
        </form>
      </details>
      <div className="dm-media-grid dm-media-grid-pro">
        {items.map((item) => (
          <article className={selected.includes(item.id) ? "selected" : ""} key={item.id}>
            <button className="dm-media-check" onClick={() => toggle(item.id)} aria-label="Sélectionner">
              {selected.includes(item.id) ? "✓" : ""}
            </button>
            <button className="dm-media-open" onClick={() => setEditing({ ...item })}>
              <MediaThumb item={item} />
            </button>
            <b>{item.title || item.name}</b>
            <small>{item.name}</small>
            <small>{item.width && item.height ? `${item.width} × ${item.height} · ` : ""}{formatBytes(item.size_bytes)}</small>
            <small>{formatDate(item.created_at)} · {labelType(item)}</small>
            {item.usages?.length > 0 && <em>Utilisé {item.usages.length} fois</em>}
            <footer>
              <button onClick={() => setEditing({ ...item })}>Modifier</button>
              <button onClick={() => trash([item.id])}>Corbeille</button>
            </footer>
          </article>
        ))}
        {!items.length && (
          <div className="dm-empty">
            <span>◇</span>
            <p>Aucun média correspondant.</p>
          </div>
        )}
      </div>
      {editing && (
        <div className="dm-modal-backdrop">
          <div className="dm-modal">
            <header>
              <div>
                <p className="dm-kicker">Détails du média</p>
                <h2>{editing.title || editing.name}</h2>
              </div>
              <button onClick={() => setEditing(null)}>×</button>
            </header>
            <div className="dm-media-detail-preview">
              <MediaThumb item={editing} />
            </div>
            <div className="dm-two">
              <Field label="Titre" value={editing.title || ""} onChange={(value) => setEditing({ ...editing, title: value })} />
              <Field label="Nom d’affichage" value={editing.name || ""} onChange={(value) => setEditing({ ...editing, name: value })} />
            </div>
            <Field label="Texte alternatif" value={editing.alt_text || ""} onChange={(value) => setEditing({ ...editing, alt_text: value })} />
            <Field label="Légende" value={editing.caption || ""} onChange={(value) => setEditing({ ...editing, caption: value })} />
            <Field label="Description" area value={editing.description || ""} onChange={(value) => setEditing({ ...editing, description: value })} />
            <label className="dm-field">
              <span>Type de média</span>
              <select value={editing.category || "photo"} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
                <option value="photo">Photo</option>
                <option value="video">Vidéo</option>
                <option value="logo">Logo</option>
                <option value="other">Autre</option>
              </select>
            </label>
            {editing.usages?.length > 0 && (
              <div className="dm-usage">
                <b>Utilisé actuellement dans</b>
                {editing.usages.map((usage: string) => <span key={usage}>{usage}</span>)}
              </div>
            )}
            <div className="dm-file-facts">
              <span>{editing.mime_type}</span>
              <span>{editing.width && editing.height ? `${editing.width} × ${editing.height}` : "Dimensions inconnues"}</span>
              <span>{formatBytes(editing.size_bytes)}</span>
              <span>Ajouté le {formatDate(editing.created_at)}</span>
            </div>
            <input
              ref={replacement}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files || []);
                event.currentTarget.value = "";
                upload(files, editing.id);
              }}
            />
            <div className="dm-actions">
              <button className="dm-secondary" onClick={() => replacement.current?.click()}>Remplacer le fichier</button>
              <a className="dm-secondary" href={`/api/media/${editing.id}?variant=original&download=1`}>Télécharger l’original</a>
              <button className="dm-save" onClick={save}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange, area = false }: { label: string; value: string; onChange: (value: string) => void; area?: boolean }) {
  return (
    <label className="dm-field">
      <span>{label}</span>
      {area ? (
        <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function labelType(item: MediaItem) {
  return item.category === "logo" ? "Logo" : item.type === "image" ? "Photo" : item.type.includes("video") ? "Vidéo" : "Autre";
}

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(new Date(`${value}Z`)) : "—";
}

function statusLabel(status: UploadStatus) {
  return status === "uploading"
    ? "Téléversement…"
    : status === "processing"
      ? "Traitement…"
      : status === "saving"
        ? "Enregistrement…"
        : status === "done"
          ? "Terminé"
          : "Échec du téléversement";
}

/**
 * Demande au serveur de supprimer les objets R2 déjà stockés pour une
 * séquence d'upload qui a échoué avant sa finalisation, afin d'éviter des
 * médias orphelins en R2 sans métadonnées D1 (AUDIT_DIVINE_MOTION.md,
 * correctif Phase 1 #3.E). Best-effort : si cet appel échoue aussi (ex. perte
 * réseau totale), l'objet reste orphelin — limite résiduelle documentée dans
 * TEST_REPORT_PHASE1.md, à traiter par un nettoyage périodique côté
 * plateforme dans une phase ultérieure.
 */
async function abortUpload(uploadId: string, stored: Record<string, string>) {
  const keys = Object.values(stored);
  if (!keys.length) return;
  try {
    await fetch("/api/admin/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "abort-upload", uploadId, keys }),
    });
  } catch {
    // Best-effort, voir commentaire ci-dessus.
  }
}

// Nombre maximal de réductions de dimension avant d'abandonner une variante.
// 2600px * 0.82^8 ≈ 520px : largement suffisant pour atteindre le plancher
// MIN_DIMENSION avant d'épuiser ce budget d'itérations.
const MAX_DIMENSION_ROUNDS = 8;
const MIN_DIMENSION = 320;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.07;

/**
 * Compresse `bitmap` en WebP sous `CLIENT_TARGET_BYTES`, en réduisant d'abord
 * la qualité puis, si nécessaire, les dimensions — de façon bornée (au plus
 * MAX_DIMENSION_ROUNDS tentatives), avec un message d'erreur explicite
 * nommant la variante en cause plutôt qu'un échec opaque (correctif
 * Phase 1 #3.B : "la compression ne doit pas boucler ou échouer de manière
 * opaque sur les images lourdes").
 */
async function encodeWithinBudget(bitmap: ImageBitmap, target: number, quality: number, name: string, label: string): Promise<File> {
  let currentTarget = target;
  for (let round = 0; round < MAX_DIMENSION_ROUNDS && currentTarget >= MIN_DIMENSION; round++) {
    const scale = Math.min(1, currentTarget / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (let currentQuality = quality; currentQuality >= MIN_QUALITY; currentQuality -= QUALITY_STEP) {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Optimisation impossible"))), "image/webp", currentQuality),
      );
      if (blob.size <= CLIENT_TARGET_BYTES) return new File([blob], `${name}.webp`, { type: "image/webp" });
    }
    currentTarget = Math.floor(currentTarget * 0.82);
  }

  throw new Error(
    `Impossible de compresser la variante « ${label} » sous ${Math.round(CLIENT_TARGET_BYTES / 1024)} Ko sans perte de qualité excessive. ` +
      "Essayez une image moins détaillée ou déjà compressée en JPEG.",
  );
}

async function variants(file: File) {
  const bitmap = await createImageBitmap(file);
  const base = file.name.replace(/\.[^.]+$/, "");
  return {
    width: bitmap.width,
    height: bitmap.height,
    files: {
      thumbnail: await encodeWithinBudget(bitmap, 480, 0.84, `${base}-thumb`, "miniature"),
      mobile: await encodeWithinBudget(bitmap, 1200, 0.89, `${base}-mobile`, "mobile"),
      desktop: await encodeWithinBudget(bitmap, 2200, 0.9, `${base}-desktop`, "desktop"),
      file: await encodeWithinBudget(bitmap, 2600, 0.9, `${base}-original`, "originale"),
    },
  };
}

// Backstop indépendant du `.timeout` natif du XHR : si le navigateur ou un
// intermédiaire réseau ne déclenche jamais onload/onerror/ontimeout (le
// scénario que l'audit retient comme cause probable du blocage à 100 %),
// cette minuterie force l'abandon de la requête au bout de 45 s plutôt que
// de laisser l'upload indéfiniment "en cours" (correctif Phase 1 #3.D).
const UPLOAD_WATCHDOG_MS = 45000;

function xhr(form: FormData, onProgress: (value: number) => void, onUploaded: () => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const watchdog = setTimeout(() => {
      if (settled) return;
      request.abort();
    }, UPLOAD_WATCHDOG_MS);

    function finish(run: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      run();
    }

    request.open("POST", "/api/admin/media");
    request.timeout = UPLOAD_WATCHDOG_MS;
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.upload.onload = onUploaded;
    request.onload = () => {
      let body: any = {};
      try { body = JSON.parse(request.responseText || "{}"); } catch {}
      if (request.status >= 200 && request.status < 300) return finish(() => resolve(body));
      const fallback =
        request.status === 413
          ? "Fichier trop volumineux."
          : request.status === 415
            ? "Format non supporté."
            : request.status >= 500
              ? "Erreur serveur pendant le traitement."
              : "Échec du téléversement.";
      finish(() => reject(new Error(body.error || fallback)));
    };
    request.onerror = () => finish(() => reject(new Error("Connexion interrompue.")));
    request.ontimeout = () => finish(() => reject(new Error("Le serveur met trop de temps à répondre. Réessayez.")));
    request.onabort = () => finish(() => reject(new Error("Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.")));
    request.send(form);
  });
}
