import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright";

// Ces tests vérifient l'isolation d'état du <VisualEditor> ENTRE PAGES lors
// d'une navigation client réelle (clic sur un lien du header, sans rechargement
// complet). C'est un point que tests/visual-editor-flow.test.mjs (fetch() HTTP
// isolé par requête) ne peut structurellement pas couvrir : chaque fetch() y
// est une requête neuve, sans hydratation ni navigation client, donc un bug de
// réutilisation de composant React entre deux pages y serait invisible. On
// pilote donc un vrai navigateur (Chromium, préinstallé dans cet environnement)
// via Playwright.
//
// Root cause investiguée pour la régression rapportée ("Services affiche du
// contenu de Notre travail après navigation") : après audit exhaustif
// (clic simple, clic rapide en rafale, édition + navigation immédiate avant la
// fin du debounce d'autosave, retour/avance navigateur), aucun de ces
// scénarios ne reproduit de fuite avec le code actuel — <VisualEditor> se
// démonte/remonte proprement à chaque changement de route dans cet
// environnement. Le correctif appliqué (voir app/visual-editor.tsx et chaque
// app/admin/editor/**/page.tsx) ajoute `key={pageKey}` à chaque instanciation :
// cela GARANTIT par construction React un démontage/remontage complet à
// chaque changement de page, quelle que soit la cause exacte d'une éventuelle
// réutilisation (qui peut dépendre de conditions — latence réseau réelle,
// version de vinext — non reproduites localement). Ces tests figent ce
// comportement pour empêcher toute régression future, avec ou sans la cause
// exacte du bug initial confirmée.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_EMAIL = "admin@example.com";

// Playwright 1.63 attend un build Chromium plus récent que celui préinstallé
// dans cet environnement (voir la doc d'environnement) : on pointe donc
// explicitement vers le binaire fourni plutôt que de laisser Playwright
// tenter (et échouer) de télécharger la version qu'il attend.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";

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

async function barText(page) {
  return page.locator(".ve-bar b").first().textContent();
}
async function mainText(page) {
  return page.locator("main").first().textContent();
}

// Une chaîne distinctive du contenu par défaut de chaque page éditeur, pour
// détecter toute fuite croisée sans dépendre d'un seul champ précis.
const pageFingerprints = {
  home: { label: "Accueil", marker: "Des histoires vraies" },
  work: { label: "Notre travail", marker: "Notre travail" },
  services: { label: "Services", marker: "Des images pour les histoires" },
  about: { label: "À propos", marker: "Derrière Divine Motion" },
  contact: { label: "Contact", marker: "Racontez-nous votre histoire" },
};
const editorUrls = {
  home: "/admin/editor",
  work: "/admin/editor/notre-travail",
  services: "/admin/editor/services",
  about: "/admin/editor/a-propos",
  contact: "/admin/editor/contact",
};

async function assertOnlyThisPage(page, pageKey) {
  const bar = await barText(page);
  const main = await mainText(page);
  const expected = pageFingerprints[pageKey];
  assert.ok(bar.includes(expected.label), `la barre doit afficher le libellé "${expected.label}" (reçu: "${bar}")`);
  assert.ok(main.includes(expected.marker), `le contenu principal doit afficher "${expected.marker}" (reçu tronqué: "${main.slice(0, 120)}")`);
  for (const [otherKey, fingerprint] of Object.entries(pageFingerprints)) {
    if (otherKey === pageKey) continue;
    assert.ok(!bar.includes(fingerprint.label), `la barre ne doit porter aucune trace de "${otherKey}" après navigation vers "${pageKey}" (reçu: "${bar}")`);
    assert.ok(!main.includes(fingerprint.marker), `le contenu ne doit porter aucune trace de "${otherKey}" (marqueur "${fingerprint.marker}") après navigation vers "${pageKey}"`);
  }
}

async function clickNavLabel(page, label) {
  await page.locator("header.site-header").getByRole("link", { name: label, exact: true }).click();
  await page.waitForTimeout(700);
}

test("navigation client Accueil → Services → À propos → Contact → Notre travail → Accueil : aucun état ni contenu ne fuit d'une page à l'autre", async () => {
  const { context, page } = await newAdminPage();
  try {
    await page.goto(baseUrl + editorUrls.home, { waitUntil: "networkidle" });
    await assertOnlyThisPage(page, "home");

    await clickNavLabel(page, "Services");
    assert.equal(new URL(page.url()).pathname, editorUrls.services, "pageKey/URL doit correspondre immédiatement à la nouvelle page");
    await assertOnlyThisPage(page, "services");

    await clickNavLabel(page, "À propos");
    assert.equal(new URL(page.url()).pathname, editorUrls.about);
    await assertOnlyThisPage(page, "about");

    await clickNavLabel(page, "Contact");
    assert.equal(new URL(page.url()).pathname, editorUrls.contact);
    await assertOnlyThisPage(page, "contact");

    await clickNavLabel(page, "Notre travail");
    assert.equal(new URL(page.url()).pathname, editorUrls.work);
    await assertOnlyThisPage(page, "work");

    await page.locator("header.site-header").getByLabel("Divine Motion — Accueil").click();
    await page.waitForTimeout(700);
    assert.equal(new URL(page.url()).pathname, editorUrls.home);
    await assertOnlyThisPage(page, "home");
  } finally {
    await context.close();
  }
});

test("sécurité : éditer Services puis naviguer immédiatement vers À propos ne sauvegarde jamais le contenu de Services sous la clé À propos", async () => {
  const { context, page } = await newAdminPage();
  const marker = `RACE-SERVICES-${Date.now()}`;
  try {
    await page.goto(baseUrl + editorUrls.services, { waitUntil: "networkidle" });

    const h1 = page.locator('h1[data-edit-key="title"]');
    await h1.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(marker, { delay: 15 });

    // Navigation immédiate : ni blur explicite, ni attente du debounce
    // d'autosave (1400ms) — c'est exactement le scénario à risque décrit.
    await clickNavLabel(page, "À propos");
    await page.waitForTimeout(2500); // largement > 1400ms

    const aboutDraft = readSetting("visual_draft_about");
    assert.ok(!aboutDraft || !aboutDraft.includes(marker), "le brouillon À propos ne doit jamais contenir le contenu édité sur Services");

    // Note : avec `key={pageKey}`, la navigation démonte immédiatement
    // l'ancienne instance, dont le nettoyage d'effet annule le minuteur
    // d'autosave encore en attente (1400ms) — conformément à la consigne
    // « si nécessaire, annule les timers/debounce lors du changement de
    // pageKey ». Cette édition très récente peut donc être perdue plutôt que
    // sauvegardée ; c'est le compromis sûr attendu (jamais de fuite plutôt
    // que perte silencieuse) et on ne l'exige donc pas ici. Ce qui compte,
    // et ce qui est vérifié plus haut et plus bas : la clé À propos ne doit
    // JAMAIS recevoir ce contenu, ni en brouillon ni au rendu.
    // Rechargement direct par URL de À propos : confirme qu'aucune trace du
    // marqueur Services n'apparaît même après un vrai rechargement serveur.
    await page.goto(baseUrl + editorUrls.about, { waitUntil: "networkidle" });
    const main = await mainText(page);
    assert.ok(!main.includes(marker), "À propos rechargé directement ne doit porter aucune trace de l'édition faite sur Services");

    // Ni Services lui-même ne doit avoir été corrompu par la séquence.
    const servicesReload = await fetch(baseUrl + editorUrls.services, { headers: { "oai-authenticated-user-email": ADMIN_EMAIL } });
    assert.equal(servicesReload.status, 200, "Services doit rester chargeable après cette séquence");
  } finally {
    await context.close();
    // Nettoyage : ne laisse pas ce brouillon de test polluer une exécution suivante.
    await fetch(`${baseUrl}/api/admin/visual-editor`, {
      method: "POST",
      headers: { "content-type": "application/json", "oai-authenticated-user-email": ADMIN_EMAIL },
      body: JSON.stringify({ pageKey: "services", action: "discard" }),
    });
  }
});

test("chaque page éditeur, rechargée directement par son URL, affiche uniquement son propre contenu", async () => {
  const { context, page } = await newAdminPage();
  try {
    for (const pageKey of Object.keys(editorUrls)) {
      await page.goto(baseUrl + editorUrls[pageKey], { waitUntil: "networkidle" });
      await assertOnlyThisPage(page, pageKey);
    }
  } finally {
    await context.close();
  }
});
