import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright";

// Vérifie, dans un vrai navigateur (voir tests/visual-editor-navigation.test.mjs
// pour la même approche sur V1), les comportements interactifs de l'éditeur
// V2 qu'un fetch() HTTP isolé ne peut pas exercer : clic-pour-éditer un champ
// texte, validation/annulation, undo/redo, et isolation d'état lors d'une
// navigation client entre pages.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_EMAIL = "admin@example.com";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium"; // voir tests/visual-editor-navigation.test.mjs

let child;
let baseUrl;
let browser;

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

function readSetting(key) {
  const dir = resolve(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((entry) => entry.endsWith(".sqlite"));
  const sqlite = new DatabaseSync(resolve(dir, file));
  try {
    const row = sqlite.prepare("SELECT value FROM cms_settings WHERE key=?").get(key);
    return row ? row.value : null;
  } finally {
    sqlite.close();
  }
}

before(async () => {
  const { proc, port } = await startDevServer();
  child = proc;
  baseUrl = `http://localhost:${port}`;
  await fetch(baseUrl + "/");
  applyMigrations();
  browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
}, { timeout: 65000 });

after(async () => {
  await browser?.close();
  killProcessTree(child);
  rmSync(resolve(root, ".dev.vars"), { force: true });
  rmSync(resolve(root, ".wrangler"), { recursive: true, force: true });
});

async function newAdminPage() {
  const context = await browser.newContext({ extraHTTPHeaders: { "oai-authenticated-user-email": ADMIN_EMAIL } });
  return { context, page: await context.newPage() };
}

const editorUrls = {
  home: "/admin/editor-v2",
  work: "/admin/editor-v2/notre-travail",
  services: "/admin/editor-v2/services",
  about: "/admin/editor-v2/a-propos",
  contact: "/admin/editor-v2/contact",
};
const pageFingerprints = {
  home: { label: "Accueil", marker: "Des histoires vraies" },
  work: { label: "Notre travail", marker: "Notre travail" },
  services: { label: "Services", marker: "Des images pour les histoires" },
  about: { label: "À propos", marker: "Derrière Divine Motion" },
  contact: { label: "Contact", marker: "Racontez-nous votre histoire" },
};

async function barText(page) {
  return page.locator(".ve2-bar b").first().textContent();
}
async function mainText(page) {
  return page.locator("main").first().textContent();
}

async function assertOnlyThisPage(page, pageKey) {
  const bar = await barText(page);
  const main = await mainText(page);
  const expected = pageFingerprints[pageKey];
  assert.ok(bar.includes(expected.label), `la barre doit afficher "${expected.label}" (reçu: "${bar}")`);
  assert.ok(main.includes(expected.marker), `le contenu doit afficher "${expected.marker}"`);
  for (const [otherKey, fingerprint] of Object.entries(pageFingerprints)) {
    if (otherKey === pageKey) continue;
    assert.ok(!bar.includes(fingerprint.label), `la barre ne doit porter aucune trace de "${otherKey}" (reçu: "${bar}")`);
    assert.ok(!main.includes(fingerprint.marker), `le contenu ne doit porter aucune trace de "${otherKey}"`);
  }
}

test("V2 Accueil ouvre correctement et affiche un champ éditable", async () => {
  const { context, page } = await newAdminPage();
  try {
    await page.goto(baseUrl + editorUrls.home, { waitUntil: "networkidle" });
    await assertOnlyThisPage(page, "home");
    await assert.ok(await page.locator('[data-edit-key="heroTitle"]').isVisible());
  } finally {
    await context.close();
  }
});

test("clic sur un champ texte → saisie → clic extérieur valide → brouillon enregistré ; Escape annule localement", async () => {
  const { context, page } = await newAdminPage();
  const marker = `V2 TEXT EDIT ${Date.now()}`;
  try {
    await page.goto(baseUrl + editorUrls.home, { waitUntil: "networkidle" });
    const heroTitle = page.locator('[data-edit-key="heroTitle"]');
    const originalText = await heroTitle.textContent();

    // Escape annule localement, sans toucher au contenu.
    await heroTitle.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("CECI NE DOIT JAMAIS ÊTRE SAUVEGARDÉ");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    assert.equal((await heroTitle.textContent()).trim(), originalText.trim(), "Escape doit restaurer le texte d'origine");

    // Édition réelle validée par un clic extérieur.
    await heroTitle.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(marker);
    await page.locator(".ve2-bar-status").click(); // clic en dehors du champ édité
    await page.waitForTimeout(200);
    assert.ok((await heroTitle.textContent()).includes(marker), "le texte doit être validé au clic extérieur");

    const statusText = await page.locator(".ve2-bar-status small").first().textContent();
    assert.ok(statusText.includes("non publiées") || statusText.includes("Enregistrement"), "le statut doit refléter l'état dirty avant l'autosave");

    await page.waitForTimeout(1600); // > debounce autosave (1200ms)
    const draft = readSetting("visual_draft_home");
    assert.ok(draft && draft.includes(marker), "l'autosave doit avoir enregistré la modification dans le brouillon Accueil");
  } finally {
    await context.close();
    await fetch(`${baseUrl}/api/admin/visual-editor`, {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": ADMIN_EMAIL },
      body: JSON.stringify({ pageKey: "home", action: "discard" }),
    });
  }
});

test("Entrée valide un champ titre ; undo/redo restaurent le texte", async () => {
  const { context, page } = await newAdminPage();
  try {
    await page.goto(baseUrl + editorUrls.about, { waitUntil: "networkidle" });
    const title = page.locator('[data-edit-key="title"]');
    const original = (await title.textContent()).trim();

    await title.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("TITRE VALIDÉ PAR ENTRÉE");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    assert.ok((await title.textContent()).includes("TITRE VALIDÉ PAR ENTRÉE"), "Entrée doit valider un champ titre");

    await page.locator(".ve2-history button").first().click(); // undo
    await page.waitForTimeout(150);
    assert.equal((await title.textContent()).trim(), original, "undo doit restaurer le texte précédent");

    await page.locator(".ve2-history button").nth(1).click(); // redo
    await page.waitForTimeout(150);
    assert.ok((await title.textContent()).includes("TITRE VALIDÉ PAR ENTRÉE"), "redo doit rétablir la modification annulée");
  } finally {
    await context.close();
    await fetch(`${baseUrl}/api/admin/visual-editor`, {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": ADMIN_EMAIL },
      body: JSON.stringify({ pageKey: "about", action: "discard" }),
    });
  }
});

test("plusieurs modifications très rapprochées restent déterministes (contenu final, historique, undo/redo)", async () => {
  // Régression pour setField() dans lib/editor-v2/store.tsx : la version
  // précédente calculait `next` à l'intérieur de l'updater passé à
  // setContent(), et dépendait donc implicitement du fait que React invoque
  // cet updater de façon synchrone avant que setField() ne poursuive — un
  // comportement observé mais jamais garanti. Le correctif calcule `next`
  // directement à partir de `contentRef.current` (tenu à jour de façon
  // synchrone), pour rester déterministe même si plusieurs setField()
  // s'enchaînent avant qu'un nouveau rendu React n'ait eu lieu — exactement
  // ce que ce test provoque : trois champs édités à la suite, sans aucune
  // attente entre les validations (chaque clic sur le champ suivant valide
  // implicitement le précédent, voir TextEditor.onClick).
  const { context, page } = await newAdminPage();
  try {
    await page.goto(baseUrl + editorUrls.about, { waitUntil: "networkidle" });

    const title = page.locator('[data-edit-key="title"]');
    const intro = page.locator('[data-edit-key="intro"]');
    const startText = page.locator('[data-edit-key="startText"]');
    const originals = {
      title: (await title.textContent()).trim(),
      intro: (await intro.textContent()).trim(),
      startText: (await startText.textContent()).trim(),
    };

    await title.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("TITRE RAPIDE 1", { delay: 0 });
    await intro.click(); // valide "title" et démarre l'édition de "intro", sans attente
    await page.keyboard.press("Control+A");
    await page.keyboard.type("INTRO RAPIDE 2", { delay: 0 });
    await startText.click(); // valide "intro" et démarre l'édition de "startText", sans attente
    await page.keyboard.press("Control+A");
    await page.keyboard.type("TEXTE RAPIDE 3", { delay: 0 });
    await page.locator(".ve2-bar-status").click(); // valide "startText"
    await page.waitForTimeout(200);

    // Contenu final correct : aucune des trois éditions n'a été perdue ou
    // écrasée par une autre malgré l'absence d'attente entre elles.
    assert.equal((await title.textContent()).trim(), "TITRE RAPIDE 1");
    assert.equal((await intro.textContent()).trim(), "INTRO RAPIDE 2");
    assert.equal((await startText.textContent()).trim(), "TEXTE RAPIDE 3");

    const undoBtn = page.locator(".ve2-history button").first();
    const redoBtn = page.locator(".ve2-history button").nth(1);

    // Historique correct : undo doit remonter chaque étape dans l'ordre
    // inverse (startText, puis intro, puis title), une à la fois.
    await undoBtn.click();
    await page.waitForTimeout(150);
    assert.equal((await startText.textContent()).trim(), originals.startText, "1er undo doit annuler la 3e édition (startText)");
    assert.equal((await intro.textContent()).trim(), "INTRO RAPIDE 2", "les éditions précédentes doivent rester en place");
    assert.equal((await title.textContent()).trim(), "TITRE RAPIDE 1");

    await undoBtn.click();
    await page.waitForTimeout(150);
    assert.equal((await intro.textContent()).trim(), originals.intro, "2e undo doit annuler la 2e édition (intro)");
    assert.equal((await title.textContent()).trim(), "TITRE RAPIDE 1", "l'édition la plus ancienne doit rester en place");

    await undoBtn.click();
    await page.waitForTimeout(150);
    assert.equal((await title.textContent()).trim(), originals.title, "3e undo doit annuler la 1re édition (title)");

    // redo doit rejouer chaque étape dans le bon ordre.
    await redoBtn.click();
    await page.waitForTimeout(150);
    assert.equal((await title.textContent()).trim(), "TITRE RAPIDE 1", "1er redo doit rétablir la 1re édition (title)");

    await redoBtn.click();
    await page.waitForTimeout(150);
    assert.equal((await intro.textContent()).trim(), "INTRO RAPIDE 2", "2e redo doit rétablir la 2e édition (intro)");

    await redoBtn.click();
    await page.waitForTimeout(150);
    assert.equal((await startText.textContent()).trim(), "TEXTE RAPIDE 3", "3e redo doit rétablir la 3e édition (startText)");

    // Le brouillon persisté doit lui aussi refléter les trois éditions.
    await page.waitForTimeout(1600); // > debounce autosave (1200ms)
    const draft = readSetting("visual_draft_about");
    assert.ok(draft, "un brouillon doit avoir été enregistré");
    const parsed = JSON.parse(draft);
    assert.equal(parsed.title, "TITRE RAPIDE 1");
    assert.equal(parsed.intro, "INTRO RAPIDE 2");
    assert.equal(parsed.startText, "TEXTE RAPIDE 3");
  } finally {
    await context.close();
    await fetch(`${baseUrl}/api/admin/visual-editor`, {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": ADMIN_EMAIL },
      body: JSON.stringify({ pageKey: "about", action: "discard" }),
    });
  }
});

test("navigation Accueil → Services → À propos → Contact → Notre travail → Accueil : aucune fuite de state", async () => {
  const { context, page } = await newAdminPage();
  try {
    await page.goto(baseUrl + editorUrls.home, { waitUntil: "networkidle" });
    await assertOnlyThisPage(page, "home");

    for (const key of ["services", "about", "contact", "work", "home"]) {
      await page.selectOption(".ve2-page-select", editorUrls[key]);
      await page.waitForTimeout(700);
      assert.equal(new URL(page.url()).pathname, editorUrls[key], `l'URL doit correspondre immédiatement à ${key}`);
      await assertOnlyThisPage(page, key);
    }
  } finally {
    await context.close();
  }
});

test("sécurité : éditer Services puis changer de page immédiatement ne sauvegarde jamais sous la mauvaise clé", async () => {
  const { context, page } = await newAdminPage();
  const marker = `V2 RACE ${Date.now()}`;
  try {
    await page.goto(baseUrl + editorUrls.services, { waitUntil: "networkidle" });
    const title = page.locator('[data-edit-key="title"]');
    await title.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(marker);

    // Changement de page immédiat, avant toute validation explicite et avant
    // la fin du debounce d'autosave : store.safeNavigate() doit d'abord
    // valider puis sauvegarder sous la BONNE clé avant de naviguer.
    await page.selectOption(".ve2-page-select", editorUrls.about);
    await page.waitForTimeout(1000);
    assert.equal(new URL(page.url()).pathname, editorUrls.about);

    const aboutDraft = readSetting("visual_draft_about");
    assert.ok(!aboutDraft || !aboutDraft.includes(marker), "le brouillon À propos ne doit jamais contenir le contenu édité sur Services");

    const servicesDraft = readSetting("visual_draft_services");
    assert.ok(servicesDraft && servicesDraft.includes(marker), "safeNavigate() doit sauvegarder sous pageKey=services avant de naviguer");
  } finally {
    await context.close();
    for (const pageKey of ["services", "about"]) {
      await fetch(`${baseUrl}/api/admin/visual-editor`, {
        method: "POST",
        headers: { "content-type": "application/json", "oai-authenticated-user-email": ADMIN_EMAIL },
        body: JSON.stringify({ pageKey, action: "discard" }),
      });
    }
  }
});
