import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Vérifie le comportement serveur (fetch() HTTP isolé, sans navigateur) de
// la fondation de l'éditeur V2 (/admin/editor-v2/**) : ouverture des routes,
// isolation brouillon/publication, normalisation d'un contenu ancien/partiel,
// et propreté du site public/V1. Les comportements interactifs (clic sur un
// champ, undo/redo, navigation client sans fuite) sont couverts séparément
// par tests/editor-v2-navigation.test.mjs (Playwright) — un fetch() isolé ne
// peut pas les exercer (voir la même remarque dans visual-editor-flow.test.mjs).
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_EMAIL = "admin@example.com";
const AUTH_HEADERS = { "oai-authenticated-user-email": ADMIN_EMAIL };

let child;
let baseUrl;

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try { proc.kill("SIGTERM"); } catch {}
  }
}

async function startDevServer() {
  rmSync(resolve(root, ".wrangler"), { recursive: true, force: true });
  writeFileSync(resolve(root, ".dev.vars"), `ADMIN_EMAILS=${ADMIN_EMAIL}\n`);
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("npm", ["run", "dev"], { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => {
      killProcessTree(proc);
      reject(new Error(`Le serveur de développement n'a pas démarré à temps.\n${output}`));
    }, 60000);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Local:\s+https?:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        proc.stdout.off("data", onData);
        resolvePromise({ proc, port: Number(match[1]) });
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", (chunk) => { output += chunk.toString(); });
    proc.on("error", (error) => { clearTimeout(timeout); reject(error); });
  });
}

function applyMigrations() {
  const dir = resolve(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((entry) => entry.endsWith(".sqlite"));
  const sqlite = new DatabaseSync(resolve(dir, file));
  for (const migration of ["drizzle/0000_fair_lilandra.sql", "drizzle/0001_steep_kulan_gath.sql"]) {
    sqlite.exec(readFileSync(resolve(root, migration), "utf8").replace(/--> statement-breakpoint/g, ""));
  }
  sqlite.close();
}

function insertLegacyDraft(pageKey, content) {
  const dir = resolve(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((entry) => entry.endsWith(".sqlite"));
  const sqlite = new DatabaseSync(resolve(dir, file));
  try {
    sqlite
      .prepare(
        "INSERT INTO cms_settings (key,value,updated_by,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) " +
          "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
      )
      .run(`visual_draft_${pageKey}`, JSON.stringify(content), ADMIN_EMAIL);
  } finally {
    sqlite.close();
  }
}

async function get(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { response, text: await response.text() };
}

async function postVisualEditor(pageKey, action, content) {
  const response = await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey, action, content }),
  });
  const json = await response.json();
  assert.equal(response.ok, true, `action ${action} (${pageKey}) devrait réussir : ${JSON.stringify(json)}`);
  return json;
}

async function discard(pageKey) {
  await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey, action: "discard" }),
  });
}

before(async () => {
  const { proc, port } = await startDevServer();
  child = proc;
  baseUrl = `http://localhost:${port}`;
  await get("/");
  applyMigrations();
}, { timeout: 65000 });

after(() => {
  killProcessTree(child);
  rmSync(resolve(root, ".dev.vars"), { force: true });
  rmSync(resolve(root, ".wrangler"), { recursive: true, force: true });
});

test("1. V1 fonctionne toujours : /admin/editor s'ouvre et reste éditable (non-régression)", async () => {
  const { response, text } = await get("/admin/editor", AUTH_HEADERS);
  assert.equal(response.status, 200);
  assert.ok(text.includes("ve-bar"), "la barre V1 doit toujours être présente");
  assert.ok(text.includes('data-edit-key="heroTitle"'), "le champ de titre V1 doit rester éditable");
});

test("2 et 3. chaque route V2 ouvre correctement (200, barre V2, page-specific content)", async () => {
  const routes = [
    ["/admin/editor-v2", "Accueil"],
    ["/admin/editor-v2/notre-travail", "Notre travail"],
    ["/admin/editor-v2/services", "Services"],
    ["/admin/editor-v2/a-propos", "À propos"],
    ["/admin/editor-v2/contact", "Contact"],
  ];
  for (const [path, label] of routes) {
    const { response, text } = await get(path, AUTH_HEADERS);
    assert.equal(response.status, 200, `${path} doit répondre 200`);
    assert.ok(text.includes("ve2-bar"), `${path} doit charger la barre V2`);
    assert.ok(text.includes(`Divine Motion V2 — <!-- -->${label}`), `${path} doit afficher le libellé "${label}"`);
    assert.ok(text.includes('data-edit-key="'), `${path} doit exposer au moins un champ éditable`);
  }
});

test("un utilisateur non authentifié ne peut pas ouvrir l'éditeur V2", async () => {
  const { response, text } = await get("/admin/editor-v2");
  assert.ok(response.url.endsWith("/admin"), "doit être redirigé vers /admin");
  assert.ok(!text.includes("ve2-bar"), "l'éditeur V2 ne doit jamais s'afficher sans authentification");
});

test("5 et 6. modifier Services puis publier une autre page ne mélange jamais les deux (isolation par pageKey)", async () => {
  const servicesDraft = { eyebrow: "x", title: "SERVICES V2 DRAFT MARKER", weddingLabel: "x", weddingTitle: "x", weddingIntro: "x", otherLabel: "x", otherTitle: "x", valuesTitle: "x", values: [], services: [], sectionOrder: ["wedding-services", "other-services", "values"], hiddenSections: [], customSections: [] };
  await postVisualEditor("services", "save", servicesDraft);

  const servicesEditor = await get("/admin/editor-v2/services", AUTH_HEADERS);
  assert.ok(servicesEditor.text.includes("SERVICES V2 DRAFT MARKER"), "le brouillon Services doit apparaître dans son propre éditeur");

  const aboutEditor = await get("/admin/editor-v2/a-propos", AUTH_HEADERS);
  assert.ok(!aboutEditor.text.includes("SERVICES V2 DRAFT MARKER"), "le brouillon Services ne doit jamais apparaître sous À propos");

  await discard("services");
});

test("7 et 8. la prévisualisation V2 reflète le brouillon, le site public ne le reflète pas", async () => {
  await postVisualEditor("contact", "save", { eyebrow: "x", title: "CONTACT V2 PREVIEW MARKER", intro: "x", asideTitle: "x", asideText: "x", zoneLabel: "x", zone: "x", travelLabel: "x", travel: "x", sectionOrder: ["contact-form"], hiddenSections: [], customSections: [] });

  const preview = await get("/admin/editor-v2/contact?preview=1", AUTH_HEADERS);
  assert.equal(preview.response.status, 200);
  assert.ok(preview.text.includes("CONTACT V2 PREVIEW MARKER"), "l'aperçu doit refléter le brouillon");
  assert.ok(!preview.text.includes("ve2-bar"), "l'aperçu ne doit afficher aucune barre d'édition");

  const pub = await get("/contact");
  assert.ok(!pub.text.includes("CONTACT V2 PREVIEW MARKER"), "le site public ne doit jamais refléter un brouillon non publié");

  await discard("contact");
});

test("9. publier depuis V2 met à jour le site public", async () => {
  await postVisualEditor("contact", "publish", { eyebrow: "x", title: "CONTACT V2 PUBLISHED MARKER", intro: "x", asideTitle: "x", asideText: "x", zoneLabel: "x", zone: "x", travelLabel: "x", travel: "x", sectionOrder: ["contact-form"], hiddenSections: [], customSections: [] });
  const pub = await get("/contact");
  assert.ok(pub.text.includes("CONTACT V2 PUBLISHED MARKER"), "le site public doit refléter le contenu publié depuis V2");
});

test("10. un ancien brouillon partiel (sans hiddenSections ni services/values) est normalisé sans crash", async () => {
  // Même classe de régression que V1 (Worker 1101, voir CHANGELOG) : un
  // brouillon plus ancien que hiddenSections/services/values ne doit jamais
  // faire planter la route grâce à normalizeServicesContent()/normalizeAboutContent().
  insertLegacyDraft("services", { eyebrow: "Ancien brouillon", title: "Ancien titre" });
  const services = await get("/admin/editor-v2/services", AUTH_HEADERS);
  assert.equal(services.response.status, 200);
  assert.ok(!services.text.includes("Internal Server Error"));
  assert.ok(services.text.includes("Ancien titre"));
  await discard("services");

  insertLegacyDraft("about", { eyebrow: "Ancien brouillon", title: "Ancien titre à propos" });
  const about = await get("/admin/editor-v2/a-propos", AUTH_HEADERS);
  assert.equal(about.response.status, 200);
  assert.ok(!about.text.includes("Internal Server Error"));
  assert.ok(about.text.includes("Ancien titre à propos"));
  await discard("about");

  insertLegacyDraft("home", { heroTitle: "Ancien titre accueil", heroSubtitle: "x", cta1: "x", cta1Url: "/contact", cta2: "x", cta2Url: "/contact" });
  const home = await get("/admin/editor-v2", AUTH_HEADERS);
  assert.equal(home.response.status, 200);
  assert.ok(!home.text.includes("Internal Server Error"));
  assert.ok(home.text.includes("Ancien titre accueil"));
  await discard("home");
});

test("11. aucune UI ni CSS V2 sur le site public ou sur V1", async () => {
  for (const path of ["/", "/notre-travail", "/services", "/a-propos", "/contact"]) {
    const { text } = await get(path);
    assert.ok(!text.includes("ve2-"), `${path} (public) ne doit porter aucune classe ve2-*`);
    assert.ok(!text.includes("editor-v2.css"), `${path} (public) ne doit jamais charger editor-v2.css`);
  }
  const v1 = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(!v1.text.includes("ve2-"), "/admin/editor (V1) ne doit porter aucune classe ve2-*");
  assert.ok(!v1.text.includes("editor-v2.css"), "/admin/editor (V1) ne doit jamais charger editor-v2.css");
});
