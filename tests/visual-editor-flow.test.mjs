import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Ces tests vérifient le comportement réel de bout en bout du nouvel éditeur
// visuel protégé (/admin/editor/**) : authentification, persistance de
// l'édition entre pages, et isolation brouillon/publication. Ils ont besoin
// d'un vrai routage Next.js + d'un vrai D1 (Miniflare), ce qu'un import direct
// du bundle sous Node ne fournit pas dans cet environnement (voir la note
// dans TEST_REPORT — importer dist/server/index.js échoue sur la résolution
// de "cloudflare:workers" hors du runtime Workers, indépendamment de ce
// correctif). On lance donc un vrai serveur de développement (Miniflare) le
// temps de la suite.
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
  // Miniflare lit les variables/secrets du Worker depuis .dev.vars, pas
  // depuis process.env de l'hôte (voir LOCAL_DEVELOPMENT.md).
  writeFileSync(resolve(root, ".dev.vars"), `ADMIN_EMAILS=${ADMIN_EMAIL}\n`);
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("npm", ["run", "dev"], {
      cwd: root,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
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

async function get(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { response, text: await response.text() };
}

before(async () => {
  const { proc, port } = await startDevServer();
  child = proc;
  baseUrl = `http://localhost:${port}`;
  // Une première requête crée le fichier SQLite local de Miniflare (absent
  // tant qu'aucune requête D1 n'a eu lieu) ; on peut ensuite y appliquer le
  // schéma avant de tester quoi que ce soit qui en dépend.
  await get("/");
  applyMigrations();
}, { timeout: 65000 });

after(() => {
  killProcessTree(child);
  rmSync(resolve(root, ".dev.vars"), { force: true });
  rmSync(resolve(root, ".wrangler"), { recursive: true, force: true });
});

test("1. une page publique normale ne contient aucun état visuel d'édition", async () => {
  for (const path of ["/", "/notre-travail"]) {
    const { response, text } = await get(path);
    assert.equal(response.status, 200, `${path} devrait répondre 200`);
    assert.ok(!text.includes("data-edit-key"), `${path} ne doit porter aucun attribut data-edit-key`);
    assert.ok(!text.includes("data-media-key"), `${path} ne doit porter aucun attribut data-media-key`);
    assert.ok(!text.includes("data-section-key"), `${path} ne doit porter aucun attribut data-section-key`);
    assert.ok(!text.includes("ve-bar"), `${path} ne doit pas charger la barre d'outils de l'éditeur`);
  }
});

test("2. un utilisateur non authentifié ne peut pas ouvrir l'éditeur", async () => {
  const { response, text } = await get("/admin/editor");
  assert.equal(response.status, 200); // après redirection suivie vers /admin
  assert.ok(response.url.endsWith("/admin"), "doit être redirigé vers /admin");
  assert.ok(!text.includes("ve-bar"), "l'éditeur ne doit jamais s'afficher sans authentification");
});

test("3. un administrateur autorisé peut ouvrir l'éditeur", async () => {
  const { response, text } = await get("/admin/editor", AUTH_HEADERS);
  assert.equal(response.status, 200);
  assert.ok(text.includes("data-edit-key=\"heroTitle\""), "le champ de titre doit être éditable");
  assert.ok(text.includes("ve-bar"), "la barre d'outils de l'éditeur doit être présente");
});

test("4. le mode édition persiste lors de la navigation entre pages", async () => {
  const home = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(
    home.text.includes('href="/admin/editor/notre-travail"'),
    "la navigation du header doit rester dans l'éditeur (editBasePath)",
  );
  const work = await get("/admin/editor/notre-travail", AUTH_HEADERS);
  assert.equal(work.response.status, 200);
  assert.ok(work.text.includes("ve-bar"), "l'éditeur doit rester actif après navigation");
  assert.ok(!work.text.includes("Se connecter avec ChatGPT"), "l'identité ne doit pas se perdre en changeant de page");
});

const draftPayload = {
  heroVisible: false,
  heroTitle: "BROUILLON TEST XYZ",
  services: [],
  principles: [],
  beyondItems: [],
  filmCtaUrl: "/notre-travail",
  finalCtaUrl: "/contact",
};

async function postVisualEditor(action, content) {
  const response = await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "home", action, content }),
  });
  const json = await response.json();
  assert.equal(response.ok, true, `action ${action} devrait réussir : ${JSON.stringify(json)}`);
  return json;
}

test("5. les modifications non publiées ne changent pas le site public", async () => {
  await postVisualEditor("save", draftPayload);
  const editor = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(editor.text.includes("BROUILLON TEST XYZ"), "le brouillon doit être visible dans l'éditeur");
  const pub = await get("/");
  assert.ok(!pub.text.includes("BROUILLON TEST XYZ"), "le site public ne doit refléter aucun brouillon non publié");
});

test("6. publier met à jour le site public", async () => {
  await postVisualEditor("publish", draftPayload);
  const pub = await get("/");
  assert.ok(pub.text.includes("BROUILLON TEST XYZ"), "le site public doit refléter le contenu publié");
});

test("7. régression : un brouillon incomplet ne fait pas planter la prévisualisation (Link href indéfini)", async () => {
  // Reproduit exactement le bug rapporté : un brouillon "work" sans
  // urbanCtaUrl faisait planter /admin/editor/notre-travail?preview=1 avec
  // "Cannot read properties of undefined (reading 'pathname')" dans le
  // <Link> de la section urbaine (voir app/notre-travail/page.tsx). Ce test
  // échoue si un futur champ consommé par un <Link href={...}> perd de
  // nouveau son filet de sécurité (`|| "..."`).
  const incompleteDraft = {
    eyebrow: "x", title: "x", intro: "x",
    storyLabel: "x", storyTitle: "x", storyDate: "2026-01-01", storyText: "x",
    chapters: [], filmTitle: "x", projectsTitle: "x", projectsIntro: "x",
    urbanLabel: "x", urbanTitle: "x", urbanIntro: "x", urbanGallery: [], urbanCta: "x",
    // urbanCtaUrl volontairement absent
  };
  const response = await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "work", action: "save", content: incompleteDraft }),
  });
  assert.equal(response.ok, true, "l'enregistrement du brouillon incomplet doit réussir");

  const preview = await get("/admin/editor/notre-travail?preview=1", AUTH_HEADERS);
  assert.equal(preview.response.status, 200, "la prévisualisation ne doit jamais renvoyer une erreur 500");
  assert.ok(!preview.text.includes("Cannot read properties of undefined"), "aucun Link ne doit recevoir un href indéfini");

  await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "work", action: "discard" }),
  });
});
