import { audit, cleanText, db, parseJson, safeJson, slugify } from "./cms-db";

export type VisualContent = Record<string, any>;

const draftKey = (pageKey: string) =>
  `visual_draft_${pageKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

const upsertSettingSql =
  "INSERT INTO cms_settings (key,value,updated_by,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) " +
  "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP";

function upsertSettingStatement(key: string, value: unknown, userEmail: string) {
  return db().prepare(upsertSettingSql).bind(key, JSON.stringify(value), userEmail);
}

export async function visualContent<T extends VisualContent>(
  pageKey: string,
  published: T,
  useDraft: boolean,
): Promise<T> {
  if (!useDraft) return published;
  const row = await db()
    .prepare("SELECT value FROM cms_settings WHERE key=?")
    .bind(draftKey(pageKey))
    .first<{ value: string }>();
  return row ? parseJson(row.value, published) : published;
}

export async function saveVisualDraft(pageKey: string, content: VisualContent, userEmail: string) {
  const value = JSON.stringify(content);
  if (value.length > 180000) throw new Error("Le brouillon est trop volumineux.");
  await db()
    .prepare(upsertSettingSql)
    .bind(draftKey(pageKey), value, userEmail)
    .run();
  await audit("visual_page", pageKey, "draft", "Brouillon visuel enregistré", userEmail);
}

export async function discardVisualDraft(pageKey: string, userEmail: string) {
  await db().prepare("DELETE FROM cms_settings WHERE key=?").bind(draftKey(pageKey)).run();
  await audit("visual_page", pageKey, "discard", "Brouillon visuel annulé", userEmail);
}

export async function publishVisualHome(content: VisualContent, userEmail: string) {
  const previous = await db()
    .prepare("SELECT value FROM cms_settings WHERE key='home'")
    .first<{ value: string }>();

  const homeValue = { ...content };
  delete homeValue.general;

  const statements = [
    upsertSettingStatement("home", homeValue, userEmail),
    db().prepare("DELETE FROM cms_settings WHERE key=?").bind(draftKey("home")),
  ];
  if (content.general) statements.push(upsertSettingStatement("general", content.general, userEmail));

  await db().batch(statements);
  await audit(
    "visual_page",
    "home",
    "publish",
    "Accueil publié depuis l’éditeur visuel",
    userEmail,
    previous ? parseJson(previous.value, {}) : {},
  );
}

// `services` et `team_members` ne possèdent pas de colonne `updated_by` dans
// db/schema.ts / drizzle/*.sql (contrairement à `projects` et `cms_settings`),
// et le chemin CMS classique (app/api/admin/cms/route.ts) ne l'écrit pas non
// plus pour ces deux tables. On aligne donc la publication visuelle sur cette
// convention existante plutôt que d'ajouter une colonne qui ne serait
// alimentée que par ce seul chemin d'écriture (voir CHANGELOG_PHASE1.md).
export async function publishVisualSettingsPage(pageKey: string, content: VisualContent, userEmail: string) {
  const settingsKey = pageKey === "services" ? "services_page" : pageKey;
  const previous = await db()
    .prepare("SELECT value FROM cms_settings WHERE key=?")
    .bind(settingsKey)
    .first<{ value: string }>();

  const pageValue = { ...content };
  delete pageValue.general;

  const statements = [
    upsertSettingStatement(settingsKey, pageValue, userEmail),
    db().prepare("DELETE FROM cms_settings WHERE key=?").bind(draftKey(pageKey)),
  ];
  if (content.general) statements.push(upsertSettingStatement("general", content.general, userEmail));

  for (const item of Array.isArray(content.services) ? content.services : []) {
    if (!item.id) continue;
    statements.push(
      db()
        .prepare(
          "UPDATE services SET name=?,description=?,cta=?,cta_url=?,visible=?,display_order=?,updated_at=CURRENT_TIMESTAMP " +
            "WHERE id=? AND deleted_at IS NULL",
        )
        .bind(
          cleanText(item.name, 180),
          cleanText(item.description, 2000),
          cleanText(item.cta, 100),
          cleanText(item.ctaUrl || item.cta_url, 300),
          item.visible === false ? 0 : 1,
          Number(item.displayOrder ?? item.display_order) || 0,
          Number(item.id),
        ),
    );
  }

  for (const item of Array.isArray(content.team) ? content.team : []) {
    if (!item.id) continue;
    statements.push(
      db()
        .prepare(
          "UPDATE team_members SET first_name=?,last_name=?,role=?,bio=?,photo_media_id=?,visible=?,display_order=?,updated_at=CURRENT_TIMESTAMP " +
            "WHERE id=? AND deleted_at IS NULL",
        )
        .bind(
          cleanText(item.firstName || item.first_name, 100),
          cleanText(item.lastName || item.last_name, 100),
          cleanText(item.role, 150),
          cleanText(item.bio, 2000),
          item.photoMediaId || item.photo_media_id || null,
          item.visible === false ? 0 : 1,
          Number(item.displayOrder ?? item.display_order) || 0,
          Number(item.id),
        ),
    );
  }

  await db().batch(statements);
  await audit(
    "visual_page",
    pageKey,
    "publish",
    `${pageKey} publié depuis l’éditeur visuel`,
    userEmail,
    previous ? parseJson(previous.value, {}) : {},
  );
}

export async function publishVisualProject(content: VisualContent, userEmail: string) {
  const id = Number(content.id);
  if (!id) throw new Error("Projet invalide.");
  const previous = await projectSnapshot(id);
  if (!previous) throw new Error("Projet introuvable.");

  const title = cleanText(content.title, 180);
  const slug = slugify(cleanText(content.slug, 100) || title);
  if (!title) throw new Error("Le titre du projet est obligatoire.");

  const values = [
    title,
    cleanText(content.peopleNames, 220),
    slug,
    cleanText(content.category, 80) || "Autre",
    cleanText(content.projectDate, 30) || null,
    cleanText(content.location, 180),
    cleanText(content.excerpt, 500),
    cleanText(content.description, 12000),
    content.coverMediaId ? Number(content.coverMediaId) : null,
    safeJson(content.gallery),
    safeJson(content.videos),
    safeJson(content.tags),
    cleanText(content.seoTitle, 180),
    cleanText(content.seoDescription, 320),
    content.seoImageMediaId ? Number(content.seoImageMediaId) : null,
    content.status === "archived" ? "archived" : "published",
    content.visible === false ? 0 : 1,
    content.featured ? 1 : 0,
    Number(content.displayOrder) || 0,
    userEmail,
    id,
  ];

  const statements = [
    db()
      .prepare(
        "UPDATE projects SET title=?,people_names=?,slug=?,category=?,project_date=?,location=?,excerpt=?,description=?," +
          "cover_media_id=?,gallery_json=?,videos_json=?,tags_json=?,seo_title=?,seo_description=?,seo_image_media_id=?," +
          "status=?,visible=?,featured=?,display_order=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .bind(...values),
    db().prepare("DELETE FROM project_sections WHERE project_id=?").bind(id),
  ];

  for (const [index, section] of (Array.isArray(content.sections) ? content.sections : []).entries()) {
    statements.push(
      db()
        .prepare(
          "INSERT INTO project_sections (project_id,section_key,title,intro,media_json,videos_json,enabled,display_order) " +
            "VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          cleanText(section.sectionKey || section.section_key, 60),
          cleanText(section.title, 180),
          cleanText(section.intro, 800),
          safeJson(section.media),
          safeJson(section.videos),
          section.enabled === false ? 0 : 1,
          index,
        ),
    );
  }

  if (content.general) statements.push(upsertSettingStatement("general", content.general, userEmail));
  statements.push(db().prepare("DELETE FROM cms_settings WHERE key=?").bind(draftKey(`project_${id}`)));

  await db().batch(statements);
  await audit("visual_page", `project_${id}`, "publish", `Projet « ${title} » publié visuellement`, userEmail, previous);
}

export async function restoreVisualPage(pageKey: string, userEmail: string) {
  const row = await db()
    .prepare(
      "SELECT snapshot_json FROM audit_log WHERE entity_type='visual_page' AND entity_id=? AND action='publish' " +
        "AND snapshot_json IS NOT NULL ORDER BY id DESC LIMIT 1",
    )
    .bind(pageKey)
    .first<{ snapshot_json: string }>();
  if (!row) throw new Error("Aucune version précédente disponible.");

  const snapshot = parseJson<VisualContent>(row.snapshot_json, {});
  if (pageKey === "home") {
    await upsertSettingStatement("home", snapshot, userEmail).run();
  } else if (pageKey.startsWith("project_")) {
    await publishVisualProject({ ...snapshot, status: snapshot.status || "published" }, userEmail);
  } else if (["work", "services", "about", "contact"].includes(pageKey)) {
    await publishVisualSettingsPage(pageKey, snapshot, userEmail);
  }

  await audit("visual_page", pageKey, "restore", "Version précédente restaurée", userEmail);
  return snapshot;
}

async function projectSnapshot(id: number) {
  const row = await db()
    .prepare("SELECT * FROM projects WHERE id=? AND deleted_at IS NULL")
    .bind(id)
    .first<Record<string, any>>();
  if (!row) return null;

  const sections = await db()
    .prepare("SELECT * FROM project_sections WHERE project_id=? ORDER BY display_order")
    .bind(id)
    .all<Record<string, any>>();

  return {
    id: row.id,
    title: row.title,
    peopleNames: row.people_names,
    slug: row.slug,
    category: row.category,
    projectDate: row.project_date,
    location: row.location,
    excerpt: row.excerpt,
    description: row.description,
    coverMediaId: row.cover_media_id,
    gallery: parseJson(row.gallery_json, []),
    videos: parseJson(row.videos_json, []),
    tags: parseJson(row.tags_json, []),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoImageMediaId: row.seo_image_media_id,
    status: row.status,
    visible: Boolean(row.visible),
    featured: Boolean(row.featured),
    displayOrder: row.display_order,
    sections: (sections.results || []).map((section: any) => ({
      sectionKey: section.section_key,
      title: section.title,
      intro: section.intro,
      media: parseJson(section.media_json, []),
      videos: parseJson(section.videos_json, []),
      enabled: Boolean(section.enabled),
    })),
  };
}
