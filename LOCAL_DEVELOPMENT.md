# Développement local — Divine Motion

Ce document remplace, pour le développement local, le passage par
ChatGPT Sites. Il a été **vérifié en exécutant réellement chaque commande**
dans un environnement isolé (pas seulement rédigé de mémoire).

## Prérequis

- **Node.js `>=22.13.0`** (vérifié avec `v22.22.2`). `npm` est fourni avec Node.
- Linux ou macOS avec `bash`. Les scripts `scripts/*.sh` utilisent `flock` et
  `timeout` (GNU coreutils) — présents nativement sous Linux ; sous macOS,
  installer `coreutils` (`brew install coreutils util-linux`) si vous
  utilisez `npm run build`/`npm run install:ci` tels quels (voir
  `README.md`, section « Sites Lifecycle », qui documente déjà cette
  contrainte, indépendante de cette phase).
- Aucun compte Cloudflare n'est requis pour développer en local : D1 et R2
  sont **simulés localement par Miniflare** (via `@cloudflare/vite-plugin`),
  sans toucher à aucune ressource réelle.
- Aucun compte ChatGPT/OpenAI n'est requis pour développer en local (voir
  « Authentification locale » ci-dessous).

## Démarrage rapide

```bash
git clone <url-du-dépôt>
cd Site-Internet-DM
npm install
npm run dev
```

Le serveur démarre sur `http://localhost:5173` (Vite choisit
automatiquement un autre port si celui-ci est occupé — regarder la sortie
de la commande). C'est la procédure officielle du projet (`README.md`),
inchangée par cette phase.

`npm install` fonctionne aussi bien que `npm ci` en local (ce dernier est la
version stricte utilisée en CI/Sites — voir `npm run install:ci` si vous
voulez reproduire exactement l'environnement verrouillé).

## D1 local

`vite.config.ts` déclare une base D1 **simulée** par Miniflare dès que
`npm run dev` démarre — aucune commande séparée n'est nécessaire pour la
créer. Elle est **vide** au premier démarrage (aucune table).

### Appliquer le schéma à la base locale

Le dépôt ne fournit pas encore de commande unique `npm run db:migrate:local`
(non ajoutée dans cette phase, pour rester minimal). Deux façons de
procéder, vérifiées toutes les deux :

**Option 1 — via `wrangler d1 execute --local`** (nécessite d'avoir démarré
`npm run dev` au moins une fois, pour que Miniflare ait créé le fichier de
base local) :

```bash
npx wrangler d1 execute site-creator-d1 --local --file=drizzle/0000_fair_lilandra.sql
npx wrangler d1 execute site-creator-d1 --local --file=drizzle/0001_steep_kulan_gath.sql
```

> `site-creator-d1` est le nom de base **placeholder** utilisé par
> `vite.config.ts` pour la simulation locale (voir `PORTABILITY_AUDIT.md`
> #5) — ne pas confondre avec une base réelle de staging/production.

**Option 2 — directement sur le fichier SQLite local**, si `wrangler d1
execute --local` échoue à retrouver la base par son nom (cela peut arriver
selon la version de Wrangler) : le fichier vit sous
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`. Node 22
inclut un module `node:sqlite` intégré (expérimental) qui permet
d'appliquer les migrations sans installer d'outil supplémentaire :

```bash
node -e '
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = fs.readdirSync(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/")
  .find(f => f.endsWith(".sqlite"));
const db = new DatabaseSync(`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/${path}`);
for (const file of ["drizzle/0000_fair_lilandra.sql", "drizzle/0001_steep_kulan_gath.sql"]) {
  db.exec(fs.readFileSync(file, "utf8").replace(/--> statement-breakpoint/g, ""));
  console.log("applied", file);
}
db.close();
'
```

Les deux options ont été testées avec succès pendant la Phase 1 (voir
`TEST_REPORT_PHASE1.md`) : les 10 tables (`cms_settings`, `projects`,
`project_sections`, `media`, `services`, `team_members`, `inquiries`,
`admin_users`, `inquiry_notes`, `audit_log`) sont créées.

### Redémarrer à zéro

Supprimer `.wrangler/` (ignoré par Git) puis relancer `npm run dev` et
réappliquer les migrations.

## R2 local

Simulé de la même façon par Miniflare, sous
`.wrangler/state/v3/r2/miniflare-R2BucketObject/` — aucune configuration
supplémentaire. Les uploads faits en local (`/api/admin/media`) y écrivent
réellement, de façon persistante entre redémarrages tant que `.wrangler/`
n'est pas supprimé.

## Authentification locale

**C'est le point le plus important à comprendre.** L'authentification admin
actuelle dépend entièrement de l'en-tête `oai-authenticated-user-email`,
injecté uniquement par le dispatcher ChatGPT Sites (voir
`AUTH_TRUST_MODEL.md`). Ni `npm run dev` ni Miniflare ne peuvent produire cet
en-tête : **il n'existe aucun moyen de se connecter à `/admin` via un
navigateur en local, aujourd'hui.**

Pour développer/tester le CMS et l'éditeur visuel en local avant que
`AUTH_MIGRATION_PLAN.md` ne soit mis en œuvre, deux approches, déjà
vérifiées :

1. **Appeler les routes `/api/admin/*` directement** (curl, script, Postman,
   client HTTP de test) en fournissant l'en-tête vous-même :
   ```bash
   curl -H "oai-authenticated-user-email: admin@example.com" \
     "http://localhost:5173/api/admin/cms?resource=dashboard"
   ```
   Cela fonctionne car **rien dans le code applicatif ne peut distinguer**
   un en-tête fourni par vous en local d'un en-tête fourni par la
   plateforme — c'est précisément la limite documentée dans
   `AUTH_TRUST_MODEL.md` (la garantie ne peut venir que de la couche qui
   route la requête, absente en local). En local, ce n'est pas un risque —
   c'est votre propre machine.
2. **Configurer `ADMIN_EMAILS`** dans `.dev.vars` (fichier non commité, lu
   par Miniflare) :
   ```bash
   echo 'ADMIN_EMAILS="admin@example.com"' > .dev.vars
   ```
   Sans cela, la liste est vide et **tout accès admin est refusé même avec
   l'en-tête ci-dessus** (échec fermé voulu, voir `lib/auth-allowlist.ts`).

Un navigateur ne peut pas ajouter cet en-tête à une navigation normale —
utiliser un point 1 scriptable, ou une extension de navigateur qui injecte
des en-têtes personnalisés en développement, si un test visuel de l'éditeur
est nécessaire avant la migration d'authentification.

## Variables d'environnement locales

Voir `.env.example` pour la liste complète et à jour. En local, seule
`ADMIN_EMAILS` a un effet (via `.dev.vars`, jamais commité — déjà dans
`.gitignore`).

## Build local

```bash
npm run build
```

Produit `dist/client/` (assets statiques) et `dist/server/index.js` (le
Worker). Vérifié fonctionnel dans un environnement sans aucun accès à
ChatGPT Sites (voir `PORTABILITY_AUDIT.md`).

## Tests

```bash
npm run test:unit   # 32 tests, aucune dépendance externe — toujours exécutable
npm run lint        # ESLint complet du dépôt (dette préexistante connue, voir CI)
npx tsc --noEmit    # Vérification de types (14 erreurs préexistantes connues, voir CI)
npm test            # build + smoke test du Worker construit
```

`npm test` (le smoke test `tests/rendered-html.test.mjs`) échoue s'il est
lancé avec `node --test` directement en dehors d'un runtime Workers (voir
`TEST_REPORT_PHASE1.md` §5) — limite déjà documentée, pas liée à cette
phase.

## Seed de données

Aucun script de seed n'existe aujourd'hui. Pour peupler une base locale
vide de contenu de démonstration : utiliser l'admin une fois authentifié
(voir ci-dessus) pour créer manuellement un projet/service/membre, ou
écrire des `INSERT` SQL directs via `wrangler d1 execute --local`. Un vrai
script de seed est hors périmètre de cette phase (portabilité uniquement).
