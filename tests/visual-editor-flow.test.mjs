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

function withD1(fn) {
  const dir = resolve(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((entry) => entry.endsWith(".sqlite"));
  const sqlite = new DatabaseSync(resolve(dir, file));
  try {
    return fn(sqlite);
  } finally {
    sqlite.close();
  }
}

// Simule un brouillon enregistré par une version antérieure de l'éditeur,
// avant l'introduction de champs comme `heroMediaAlt`/`hiddenSections`, ou
// avant que `services`/`values`/`team` existent dans le brouillon. On écrit
// directement en base plutôt que via l'API : l'éditeur actuel ne produit
// jamais lui-même un brouillon incomplet (il part toujours d'un objet
// entièrement défaulté), donc seule une insertion directe reproduit
// fidèlement un « vieux » brouillon.
function insertLegacyDraft(pageKey, content) {
  withD1((sqlite) => {
    sqlite
      .prepare(
        "INSERT INTO cms_settings (key,value,updated_by,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) " +
          "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
      )
      .run(`visual_draft_${pageKey}`, JSON.stringify(content), ADMIN_EMAIL);
  });
}

function insertProjectFixture(slug, title) {
  withD1((sqlite) => {
    sqlite.prepare("INSERT INTO projects (title, slug, status, visible) VALUES (?,?,?,?)").run(title, slug, "published", 1);
  });
}

async function discardDraft(pageKey) {
  await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey, action: "discard" }),
  });
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
    assert.ok(!text.includes("data-position-key"), `${path} ne doit porter aucun attribut data-position-key`);
    assert.ok(!text.includes("data-alt-key"), `${path} ne doit porter aucun attribut data-alt-key`);
    assert.ok(!text.includes("data-gallery-key"), `${path} ne doit porter aucun attribut data-gallery-key`);
    assert.ok(!text.includes("ve-hidden-section"), `${path} ne doit porter aucune classe d'éditeur ve-hidden-section`);
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

// --- Phase UX 1 : non-régression sur la barre et la navigation de l'éditeur ---

test("8. la barre affiche le nom de la page et le statut Publié par défaut", async () => {
  const cases = [
    ["/admin/editor", "Accueil"],
    ["/admin/editor/notre-travail", "Notre travail"],
    ["/admin/editor/services", "Services"],
    ["/admin/editor/a-propos", "À propos"],
    ["/admin/editor/contact", "Contact"],
  ];
  for (const [path, label] of cases) {
    const { text } = await get(path, AUTH_HEADERS);
    assert.ok(text.includes(`Divine Motion — <!-- -->${label}`), `${path} doit afficher le libellé "${label}" dans la barre`);
    assert.ok(text.includes("Publié</small>"), `${path} doit afficher le statut "Publié" sans brouillon en attente`);
  }
});

test("9. le sélecteur de page reste toujours dans /admin/editor/* et marque la page actuelle", async () => {
  const { text } = await get("/admin/editor/services", AUTH_HEADERS);
  assert.ok(text.includes('class="ve-page-select"'), "le sélecteur de page doit être présent");
  for (const href of ["/admin/editor", "/admin/editor/notre-travail", "/admin/editor/services", "/admin/editor/a-propos", "/admin/editor/contact"]) {
    assert.ok(text.includes(`value="${href}"`), `le sélecteur doit proposer ${href}`);
  }
  assert.ok(text.includes('value="/admin/editor/services" selected'), "la page actuelle doit être présélectionnée");
});

test("10. le statut reflète un brouillon existant à l'ouverture de l'éditeur", async () => {
  await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "contact", action: "save", content: { eyebrow: "x", title: "x" } }),
  });
  const { text } = await get("/admin/editor/contact", AUTH_HEADERS);
  assert.ok(text.includes("Brouillon enregistré</small>"), "un brouillon existant doit afficher \"Brouillon enregistré\" dès le chargement");
  await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "contact", action: "discard" }),
  });
});

// --- Polish média/panneau : cadrage, confirmation d'abandon ---

const cropDraft = {
  heroVisible: true,
  heroType: "image",
  heroMediaId: 1,
  heroPosition: "center top",
  heroTitle: "x",
  heroSubtitle: "x",
  cta1: "x",
  cta1Url: "/contact",
  cta2: "x",
  cta2Url: "/contact",
  services: [],
  principles: [],
  beyondItems: [],
  filmCtaUrl: "/contact",
  finalCtaUrl: "/contact",
};

test("11. le cadrage choisi persiste en brouillon et apparaît dans l'éditeur et l'aperçu", async () => {
  await postVisualEditor("save", cropDraft);
  const editor = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(editor.text.includes("object-position:center top"), "l'éditeur doit appliquer le cadrage du brouillon");
  const previewView = await get("/admin/editor?preview=1", AUTH_HEADERS);
  assert.ok(previewView.text.includes("object-position:center top"), "l'aperçu doit appliquer le cadrage du brouillon");
  const pub = await get("/");
  assert.ok(!pub.text.includes("center top"), "le site public ne doit pas encore refléter le cadrage non publié");
});

test("12. publier applique le cadrage choisi au site public", async () => {
  await postVisualEditor("publish", cropDraft);
  const pub = await get("/");
  assert.ok(pub.text.includes("object-position:center top"), "le site public doit refléter le cadrage publié");
});

test("13. « Abandonner le brouillon » n'est plus une action de premier niveau", async () => {
  const { text } = await get("/admin/editor", AUTH_HEADERS);
  // Le bouton ne doit plus apparaître par défaut : il est maintenant replié
  // dans le menu secondaire "⋯" (rendu uniquement une fois ouvert côté client).
  assert.ok(!text.includes(">Abandonner le brouillon<"), "le bouton ne doit pas être exposé directement dans la barre");
  assert.ok(text.includes('aria-label="Plus d’actions"'), "le déclencheur du menu secondaire doit être présent");
});

// --- Phase UX 2 complète : média hero (alt), sections réellement masquables,
// réorganisation de galerie ---
// Note : le panneau latéral (aside/média/galerie) est de l'état client pur,
// jamais rendu côté serveur (il part de `useState(null)`) — ces comportements
// interactifs sont donc couverts par tests/editor-panel-helpers.test.ts
// (mediaLabel, sectionLabel, sectionBounds) plutôt qu'ici. Ce fichier vérifie
// ce qui est observable côté HTTP : persistance brouillon/publication et
// rendu public/éditeur qui en résulte.

const heroAltDraft = { ...cropDraft, heroMediaAlt: "Texte alternatif hero test" };

test("14. le texte alternatif du hero persiste en brouillon et se publie fidèlement", async () => {
  await postVisualEditor("save", heroAltDraft);
  const editor = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(editor.text.includes('alt="Texte alternatif hero test"'), "l'éditeur doit refléter l'alt du brouillon");
  await postVisualEditor("publish", heroAltDraft);
  const pub = await get("/");
  assert.ok(pub.text.includes('alt="Texte alternatif hero test"'), "le site public doit refléter l'alt publié");
});

async function postWork(action, content) {
  const response = await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "work", action, content }),
  });
  const json = await response.json();
  assert.equal(response.ok, true, `action ${action} (work) devrait réussir : ${JSON.stringify(json)}`);
  return json;
}

const workBaseDraft = {
  eyebrow: "x", title: "x", intro: "x",
  storyLabel: "x", storyTitle: "SECTION MASQUEE TEST", storyDate: "2026-01-01", storyText: "x",
  chapters: [], filmTitle: "x", projectsTitle: "x", projectsIntro: "x",
  urbanLabel: "x", urbanTitle: "x", urbanIntro: "x", urbanGallery: [], urbanCta: "x", urbanCtaUrl: "/contact",
};

test("15. « Masquer » une section sur Notre travail la retire réellement du site public (correctif hiddenSections)", async () => {
  // Avant Phase UX 2, `hiddenSections` était déclaré sur cette page mais
  // jamais relu au rendu : "Masquer" n'avait donc aucun effet visible ni
  // public (voir l'audit). Ce test échoue si la régression revient.
  await postWork("save", { ...workBaseDraft, hiddenSections: ["story"] });
  const editor = await get("/admin/editor/notre-travail", AUTH_HEADERS);
  assert.ok(editor.text.includes("SECTION MASQUEE TEST"), "la section masquée doit rester visible dans l'éditeur");
  assert.ok(
    editor.text.includes('class="story-intro section wrap ve-hidden-section"'),
    "la section masquée doit être visuellement identifiable (atténuée) dans l'éditeur",
  );
  await postWork("publish", { ...workBaseDraft, hiddenSections: ["story"] });
  const pub = await get("/notre-travail");
  assert.equal(pub.response.status, 200);
  // On vérifie l'absence de la structure DOM réelle de la section (sa classe
  // dédiée `story-intro`), pas seulement du texte : en mode développement,
  // le flux RSC intègre les props complètes reçues par le composant serveur
  // à des fins de traçage React DevTools, ce qui ferait apparaître le texte
  // même quand la section correspondante n'a jamais été rendue dans le DOM.
  assert.ok(!pub.text.includes('class="story-intro'), "le site public ne doit plus rendre la section masquée");
});

test("16. « Afficher » une section précédemment masquée la restaure sur le site public", async () => {
  await postWork("publish", { ...workBaseDraft, hiddenSections: [] });
  const pub = await get("/notre-travail");
  assert.ok(pub.text.includes('class="story-intro section wrap"'), "réafficher la section doit la restaurer sur le site public");
  assert.ok(pub.text.includes("SECTION MASQUEE TEST"), "le contenu de la section restaurée doit être visible");
});

test("17. réorganiser la galerie urbaine persiste le nouvel ordre et se reflète fidèlement", async () => {
  const ordered = { ...workBaseDraft, hiddenSections: [], urbanGallery: [{ id: 101, alt: "Un" }, { id: 102, alt: "Deux" }] };
  await postWork("save", ordered);
  const before = await get("/admin/editor/notre-travail", AUTH_HEADERS);
  const firstBefore = before.text.indexOf("/api/media/101");
  const secondBefore = before.text.indexOf("/api/media/102");
  assert.ok(firstBefore > -1 && secondBefore > -1 && firstBefore < secondBefore, "l'ordre initial doit placer 101 avant 102");

  const reordered = { ...ordered, urbanGallery: [{ id: 102, alt: "Deux" }, { id: 101, alt: "Un" }] };
  await postWork("save", reordered);
  const after = await get("/admin/editor/notre-travail", AUTH_HEADERS);
  const firstAfter = after.text.indexOf("/api/media/101");
  const secondAfter = after.text.indexOf("/api/media/102");
  assert.ok(secondAfter > -1 && firstAfter > -1 && secondAfter < firstAfter, "la réorganisation doit inverser l'ordre affiché");
});

// --- Phase UX 2 bis : régressions staging (hero sans média, Worker 1101 sur
// des brouillons anciens/partiels) ---

test("18. régression Worker 1101 : un ancien brouillon Services sans `services` ni `hiddenSections` ne plante plus /admin/editor/services", async () => {
  // Reproduit exactement le bug de staging : `visualContent()` substituait
  // entièrement le brouillon aux valeurs publiées, donc un brouillon plus
  // ancien que le champ `services` faisait planter `page.services.filter()`
  // (TypeError: Cannot read properties of undefined). Voir le correctif dans
  // lib/visual-editor.ts (fusion brouillon + publié) et app/services/page.tsx
  // (repli `Array.isArray`).
  insertLegacyDraft("services", { eyebrow: "Ancien brouillon", title: "Ancien titre" });
  const { response, text } = await get("/admin/editor/services", AUTH_HEADERS);
  assert.equal(response.status, 200, "la route ne doit jamais renvoyer 500/1101 pour un brouillon incomplet");
  assert.ok(!text.includes("Internal Server Error") && !text.includes("Erreur 1101"));
  assert.ok(text.includes("Ancien titre"), "les champs présents dans le brouillon doivent tout de même s'afficher");
  await discardDraft("services");
});

test("19. régression Worker 1101 : un ancien brouillon À propos sans `values` ni `hiddenSections` ne plante plus /admin/editor/a-propos", async () => {
  insertLegacyDraft("about", { eyebrow: "Ancien brouillon", title: "Ancien titre" });
  const { response, text } = await get("/admin/editor/a-propos", AUTH_HEADERS);
  assert.equal(response.status, 200, "la route ne doit jamais renvoyer 500/1101 pour un brouillon incomplet");
  assert.ok(!text.includes("Internal Server Error") && !text.includes("Erreur 1101"));
  assert.ok(text.includes("Ancien titre"));
  await discardDraft("about");
});

test("20. un ancien brouillon Accueil sans heroMediaAlt/hiddenSections/services/principles/beyondItems ne plante pas /admin/editor", async () => {
  insertLegacyDraft("home", {
    heroTitle: "Ancien titre accueil", heroSubtitle: "x",
    cta1: "x", cta1Url: "/contact", cta2: "x", cta2Url: "/contact",
    // heroMediaAlt, hiddenSections, services, principles, beyondItems, sectionOrder : volontairement absents
  });
  const { response, text } = await get("/admin/editor", AUTH_HEADERS);
  assert.equal(response.status, 200);
  assert.ok(!text.includes("Internal Server Error"));
  assert.ok(text.includes("Ancien titre accueil"));
  await discardDraft("home");
});

test("21. un brouillon volontairement partiel, sauvegardé via l'API réelle, ne fait planter aucune route de l'éditeur", async () => {
  // Contrairement aux tests 18-20 (brouillon injecté directement en base pour
  // simuler l'ancien format), celui-ci passe par le vrai chemin d'écriture
  // (`action: "save"`) avec un contenu délibérément minimal — pour détecter
  // à l'avenir toute nouvelle lecture non protégée, quelle que soit son
  // origine.
  const response = await fetch(`${baseUrl}/api/admin/visual-editor`, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ pageKey: "services", action: "save", content: { title: "Partiel" } }),
  });
  assert.equal(response.ok, true);
  for (const path of ["/admin/editor/services", "/admin/editor/services?preview=1"]) {
    const { response: pageResponse } = await get(path, AUTH_HEADERS);
    assert.equal(pageResponse.status, 200, `${path} ne doit pas planter avec un brouillon partiel`);
  }
  await discardDraft("services");
});

test("22. toutes les routes éditeur principales (y compris la page projet) retournent 200, sans brouillon", async () => {
  insertProjectFixture("projet-test-phase-ux2-bis", "Projet de test");
  const routes = [
    "/admin/editor",
    "/admin/editor/notre-travail",
    "/admin/editor/services",
    "/admin/editor/a-propos",
    "/admin/editor/contact",
    "/admin/editor/projets/projet-test-phase-ux2-bis",
  ];
  for (const path of routes) {
    const { response, text } = await get(path, AUTH_HEADERS);
    assert.equal(response.status, 200, `${path} doit répondre 200`);
    assert.ok(!text.includes("Internal Server Error") && !text.includes("Erreur 1101"), `${path} ne doit jamais lever d'exception non gérée`);
  }
});

test("23. la prévisualisation de toutes les routes éditeur principales retourne 200", async () => {
  const routes = [
    "/admin/editor?preview=1",
    "/admin/editor/notre-travail?preview=1",
    "/admin/editor/services?preview=1",
    "/admin/editor/a-propos?preview=1",
    "/admin/editor/contact?preview=1",
    "/admin/editor/projets/projet-test-phase-ux2-bis?preview=1",
  ];
  for (const path of routes) {
    const { response, text } = await get(path, AUTH_HEADERS);
    assert.equal(response.status, 200, `${path} doit répondre 200`);
    assert.ok(!text.includes("Internal Server Error"), `${path} ne doit jamais lever d'exception non gérée`);
  }
});

test("24. le site public (y compris la page projet) reste propre, sans aucune UI d'éditeur", async () => {
  for (const path of ["/", "/notre-travail", "/services", "/a-propos", "/contact", "/projets/projet-test-phase-ux2-bis"]) {
    const { response, text } = await get(path);
    assert.equal(response.status, 200, `${path} devrait répondre 200`);
    assert.ok(!text.includes("data-edit-key"), `${path} ne doit porter aucun attribut data-edit-key`);
    assert.ok(!text.includes("data-media-key"), `${path} ne doit porter aucun attribut data-media-key`);
    assert.ok(!text.includes("data-section-key"), `${path} ne doit porter aucun attribut data-section-key`);
    assert.ok(!text.includes("ve-bar"), `${path} ne doit pas charger la barre d'outils de l'éditeur`);
  }
});

test("25. hero sans média puis média ajouté : transition du placeholder vers l'image avec cadrage et alt", async () => {
  // Avant correctif, la zone média du hero restait techniquement cliquable,
  // mais le calque .hero-shade posé par-dessus interceptait le clic et
  // routait systématiquement vers le panneau section (voir le correctif CSS
  // dans app/globals.css et le test unitaire dédié dans
  // editor-panel-helpers.test.ts). Ce test vérifie la partie serveur de la
  // séquence attendue : hero vide → aucune image, puis média ajouté → image
  // avec cadrage et alt appliqués, sans reload nécessaire côté données.
  const emptyHero = { ...cropDraft, heroMediaId: null, heroMediaAlt: "" };
  await postVisualEditor("save", emptyHero);
  const empty = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(empty.text.includes("hero-placeholder"), "sans média, le hero doit afficher son placeholder");
  assert.ok(!empty.text.includes("object-position:center top"), "sans média, aucun cadrage ne doit être appliqué");

  const withMedia = { ...cropDraft, heroMediaId: 7, heroPosition: "center top", heroMediaAlt: "Alt après ajout" };
  await postVisualEditor("save", withMedia);
  const filled = await get("/admin/editor", AUTH_HEADERS);
  assert.ok(!filled.text.includes("hero-placeholder"), "une fois le média ajouté, le placeholder doit disparaître");
  assert.ok(filled.text.includes("object-position:center top"), "le cadrage doit être disponible dès l'ajout du média");
  assert.ok(filled.text.includes('alt="Alt après ajout"'), "l'alt doit être appliqué dès l'ajout du média");
});
