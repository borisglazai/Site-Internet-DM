# Audit de portabilité — Divine Motion hors ChatGPT Sites

Objectif : identifier, avec précision de fichier et de ligne, tout ce qui
couple aujourd'hui ce projet à la plateforme ChatGPT Sites / OpenAI
Workspace, pour pouvoir le développer, tester et déployer dans un workflow
classique (GitHub → local/Claude/Codex → staging → production) sur
Cloudflare directement. Aucun code n'a été modifié pour produire ce document
— c'est un audit, pas une migration.

**Méthode** : lecture complète du dépôt, recherche exhaustive des patterns
`oai-`, `chatgpt`, `.openai`, `SITES_`, `sites-`, et inspection de la sortie
réelle de `npm run build` (le dossier `dist/`) pour voir ce que la chaîne de
build produit concrètement, plutôt que de le supposer.

## Constat général

La stack technique elle-même (Next.js App Router + **vinext**, l'adaptateur
Cloudflare officiel du projet `cloudflare/vinext`, + Vite + `@cloudflare/vite-plugin`
+ Wrangler + Drizzle + D1 + R2) est **déjà Cloudflare-native, pas
Sites-spécifique**. `vinext build` produit d'ailleurs déjà un
`dist/server/wrangler.json` complet et valide (compatibility_date, règles
ESM, bindings D1/R2, dossier d'assets) — la preuve la plus concrète que la
chaîne de build ne dépend pas de Sites pour fonctionner. Les points de
couplage réels sont concentrés sur trois axes : **l'authentification**
(SIWC), **l'identité des ressources déployées** (Sites injecte les vraies
liaisons D1/R2/domaine hors du dépôt, via `project_id`), et **quelques
scripts d'outillage** nommés d'après Sites mais qui n'appellent en réalité
aucune API Sites.

## Tableau des dépendances

| # | Fichier / zone | Rôle | Criticité | Difficulté de remplacement | Solution proposée |
|---|---|---|---|---|---|
| 1 | `app/chatgpt-auth.ts` (tout le fichier) | Lit `oai-authenticated-user-email`/`-full-name*`, construit les chemins `/signin-with-chatgpt`, `/signout-with-chatgpt` | **Bloquant** pour l'auth hors Sites | Élevée (c'est le seul mécanisme d'identité existant) | Voir `AUTH_MIGRATION_PLAN.md` — remplacement progressif, ne pas toucher maintenant |
| 2 | `lib/admin-auth.ts:1-9` | Consomme `getChatGPTUser()` puis compare à `ADMIN_EMAILS` | Bloquant (dépend de #1) | Faible une fois #1 traité — la logique d'allowlist (`lib/auth-allowlist.ts`) est déjà indépendante de Sites | Adapter uniquement le point d'entrée identité (`getChatGPTUser`→nouvelle fonction), garder l'allowlist telle quelle |
| 3 | Routes réservées `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback` | Documentées dans `ROUTES_AND_API.md` comme *« réservées à la plateforme, non implémentées dans le dépôt »* | Bloquant | N/A — n'existent pas dans le code, gérées entièrement par le dispatcher Sites | Elles n'ont **rien à retirer** : il faut seulement fournir un remplaçant (voir `AUTH_MIGRATION_PLAN.md`) |
| 4 | `.openai/hosting.json` | `{"d1":"DB","project_id":"appgprj_...","r2":"BUCKET"}` — Sites lit `project_id` pour injecter les vraies liaisons D1/R2/domaine **hors du dépôt**, à son propre déploiement | Élevée pour un déploiement direct (aucune vraie liaison n'existe sans lui) | Faible | Garder ce fichier (le flux Sites doit continuer à fonctionner) ; ajouter en parallèle un chemin de déploiement Cloudflare natif qui n'en dépend pas (voir §"Bindings" plus bas et `DEPLOYMENT_OUTSIDE_SITES.md`) |
| 5 | `vite.config.ts:1-34` | Lit `.openai/hosting.json` pour nommer les bindings (`DB`/`BUCKET`) simulés localement par Miniflare, avec des identifiants **placeholder** (`00000000-0000-4000-8000-000000000000`, `site-creator-d1`, `site-creator-r2`) | Faible | — | Ne rien changer : c'est déjà un simulateur de dev local, pas un mécanisme de déploiement. Documenté dans `LOCAL_DEVELOPMENT.md` |
| 6 | `app/layout.tsx:6` | `metadataBase: new URL("https://divine-motion-studio.chatgpt.site")`, domaine Sites en dur | Moyen (SEO/OG cassés hors du domaine Sites, pas de crash) | Faible | **Non corrigé dans cette phase** (aucun domaine réel choisi encore, voir §16) ; prévoir de le rendre pilotable par variable d'environnement (`SITE_URL`) dès qu'un domaine est retenu |
| 7 | `build/sites-vite-plugin.ts` | Copie `.openai/hosting.json` et `drizzle/` dans `dist/.openai/` après le build | Faible | — | Inoffensif hors Sites (un déploiement Cloudflare direct ignore simplement `dist/.openai/`) ; ne pas retirer, le flux Sites en a besoin |
| 8 | `scripts/sites-env.sh` | Isole `HOME`/cache npm/`TMPDIR` dans `.sites-runtime/` — pensé pour une image Sites en lecture seule | Faible | — | Fonctionne aussi hors Sites (ne fait qu'utiliser des chemins de travail réinscriptibles) mais inutile en CI standard ; **non utilisé** par la nouvelle CI GitHub (voir `.github/workflows/ci.yml`), gardé intact pour le flux Sites existant |
| 9 | `scripts/install-ci.sh` | Vérifie `SITES_PROJECT_ROOT`, verrou `flock`, cache npm image-seedé, préflight d'intégrité du tarball vinext | Faible fonctionnellement, mais fragile hors de son contexte (suppose un `HOME` précis) | Moyenne si on veut le réutiliser tel quel | La CI GitHub utilise `npm ci` nu à la place (voir §10) ; ce script reste pour le flux Sites |
| 10 | `scripts/build-verified.sh` | Appelle `sites-env.sh` puis `vinext build` avec un timeout borné | Faible — **s'exécute avec succès dans un environnement non-Sites** (vérifié : `npm run build` fonctionne dans ce bac à sable, hors de toute plateforme Sites) | — | Réutilisable tel quel en CI (bash + `timeout` GNU, présents sur les runners GitHub Ubuntu) ; c'est ce que fait `.github/workflows/ci.yml` |
| 11 | `.npmrc` | `cache=.sites-runtime/npm-cache` | Cosmétique | — | Fonctionne identiquement hors Sites (juste un chemin de cache local) ; non modifié |
| 12 | `dist/server/wrangler.json` (généré par `vinext build`, pas commité) | Contient les **mêmes identifiants placeholder** que `vite.config.ts` (`database_id: 00000000-...`, noms `site-creator-*`) — confirme qu'**aucun wrangler.json réel n'est aujourd'hui consommé pour le déploiement** : Sites déploie le bundle et injecte les vraies liaisons **hors bande**, indépendamment de ce fichier | Élevée à comprendre, faible à corriger | Faible | Ne pas dupliquer ce fichier à la main (il resterait à synchroniser avec chaque mise à jour de `vinext`) ; le **patcher après build** avec les vraies valeurs par environnement via un petit script (`scripts/deploy-config.mjs`, ajouté par cette phase) — voir `DEPLOYMENT_OUTSIDE_SITES.md` |
| 13 | `worker/index.ts:5-15` (interface `Env`) | Déclare `IMAGES` comme liaison Cloudflare Images native (pas Sites) | Faible | — | Binding Cloudflare standard, indépendant de Sites. Vérifié dans le code de `vinext` (`node_modules/vinext/dist/server/image-optimization.js`) : si `env.IMAGES` est absent, l'optimisation d'image se dégrade proprement en passthrough (image d'origine servie telle quelle, pas de plantage) — donc **non bloquant** même sans provisionner le produit Cloudflare Images |
| 14 | `README.md` (sections « Sites Lifecycle », « Workspace Auth Headers », « Optional Dispatch-Owned ChatGPT Sign-In ») | Documentation orientée Sites | Aucune (texte, pas de code) | — | Conservé tel quel (toujours vrai pour le flux Sites) ; `LOCAL_DEVELOPMENT.md` et `DEPLOYMENT_OUTSIDE_SITES.md` documentent le second chemin, sans réécrire celui-ci |
| 15 | `next.config.ts`, `drizzle.config.ts` | Vérifiés : aucune référence à Sites, OpenAI, ni à un chemin `.openai/*` | — | — | Déjà 100 % portables, aucune action |
| 16 | Package `vinext` (dépendance npm) | Adaptateur Next.js→Cloudflare Workers, maintenu par Cloudflare (`cloudflare/vinext`), **pas** un package OpenAI/Sites | Aucune | — | Aucune action — c'est la fondation qui rend tout le reste possible |

## Variables d'environnement injectées implicitement par Sites

D'après `README.md` et le code, la plateforme Sites injecte, **au niveau du
dispatcher**, sans que le dépôt les déclare nulle part :

- `oai-authenticated-user-email` (en-tête HTTP, pas une variable d'env)
- `oai-authenticated-user-full-name` / `oai-authenticated-user-full-name-encoding` (idem)
- les vraies valeurs des bindings `DB` (D1) et `BUCKET` (R2), résolues à partir de `project_id` dans `.openai/hosting.json`
- implicitement, le domaine `*.chatgpt.site` sur lequel le Worker est exposé

Aucune variable d'environnement au sens Wrangler (`vars`/secrets) n'est
aujourd'hui définie par Sites au-delà de `ADMIN_EMAILS` (documentée dans
`.env.example`, à configurer manuellement côté plateforme dans les deux cas).

## Ce qui empêcherait aujourd'hui un déploiement direct sur Cloudflare

1. **Aucune vraie ressource D1/R2 n'existe hors de celles gérées par Sites** — il faut en créer (voir `ENVIRONMENTS.md`, non fait dans cette phase).
2. **Aucun mécanisme d'authentification ne fonctionne hors du dispatcher Sites** — `getChatGPTUser()` renverrait toujours `null` (aucun en-tête `oai-authenticated-user-email` n'existe hors Sites), donc `/admin` resterait accessible en lecture publique mais **personne ne pourrait s'y connecter** — c'est un échec fermé sûr (voir `AUDIT_DIVINE_MOTION.md`/`AUTH_TRUST_MODEL.md`), pas une brèche de sécurité, mais rend le CMS inutilisable tel quel hors Sites.
3. **Aucun `wrangler.json`/`wrangler.jsonc` avec de vraies valeurs n'est actuellement produit** — celui généré par le build contient des placeholders (point 12 ci-dessus).

Rien d'autre ne bloque un déploiement Cloudflare direct : le rendu public, le
CMS classique, l'éditeur visuel, D1, R2, Drizzle fonctionnent déjà
indépendamment de Sites une fois ces trois points traités (voir
`DEPLOYMENT_OUTSIDE_SITES.md` et `AUTH_MIGRATION_PLAN.md`).

## Prochaines étapes couvertes par cette phase

Voir `LOCAL_DEVELOPMENT.md`, `ENVIRONMENTS.md`, `AUTH_MIGRATION_PLAN.md`,
`DEPLOYMENT_OUTSIDE_SITES.md`, `ROLLBACK_EXTERNAL_HOSTING.md` et
`.github/workflows/ci.yml`. Le rapport de synthèse (dépendances Sites
restantes / rendu portable / reste à migrer / risques classés / recommandation)
est fourni séparément à la fin de cette phase.
