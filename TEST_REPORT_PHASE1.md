# Rapport de tests — Phase 1

Environnement : bac à sable Linux isolé, `Node.js v22.22.2`, `npm ci` exécuté
avec succès (507 paquets). Trois niveaux de vérification ont été utilisés :
(1) tests automatisés unitaires/statiques, (2) build complet du projet,
(3) exécution réelle du serveur de développement avec D1 et R2 **simulés
localement** par Miniflare (via `@cloudflare/vite-plugin`), migrations SQL
appliquées à la base locale, et appels HTTP réels reproduisant les scénarios
demandés. Aucun accès à la base D1 ni aux objets R2 **de production** n'a été
utilisé ni n'était nécessaire.

## Résumé

| Correctif | Tests automatisés | Vérification runtime réelle |
|---|---|---|
| 1. Schéma SQL services/team | ✅ `tests/schema-sql-consistency.test.ts` | ✅ Scénario complet exécuté (voir §1) |
| 2. Crash null /notre-travail | ✅ `tests/media-normalize.test.ts` | ✅ Reproduit puis corrigé en direct (voir §2) |
| 3. Pipeline upload | ✅ `tests/upload-limits.test.ts` | ✅ Séquence multipart complète exécutée (voir §3) |
| 4. Frontière d'authentification | ✅ `tests/auth-allowlist.test.ts` | ✅ Cas autorisé/refusé/casse testés (voir §4) |

**32/32 tests automatisés passent.** `npm run build` réussit sans erreur.
`npx tsc --noEmit` ne signale aucune erreur nouvelle dans les fichiers
modifiés (voir §6 pour le détail de cette vérification différentielle).

---

## 1. Correctif schéma SQL — preuve avant/après

**Commande** : `node --test tests/schema-sql-consistency.test.ts` → 6/6 tests
verts. Ce test parse `db/schema.ts` et `lib/visual-editor.ts` et échoue si une
requête référence une colonne absente du schéma — garde-fou permanent contre
la réintroduction de ce bug précis.

**Scénario réel exécuté** (serveur de développement, D1 local migré) :

1. Création d'un service classique : `POST /api/admin/cms`
   `{"resource":"service","item":{"name":"Photographie de mariage",...}}`
   → `{"ok":true,"id":1}`.
2. **Avec le code d'origine** (bug reproduit intentionnellement pour
   preuve) : `POST /api/admin/visual-editor`
   `{"pageKey":"services","action":"publish","content":{"services":[{"id":1,...}]}}`
   → **`HTTP 500` `{"error":"D1_ERROR: no such column: updated_by: SQLITE_ERROR"}`**
   — confirmation exacte du bug décrit dans l'audit.
3. **Avec le code corrigé** : la même requête → **`HTTP 200`
   `{"ok":true,"state":"published"}`**.
4. Rechargement (`GET /api/admin/cms?resource=services`) : le nouveau nom
   « Photographie de mariage — publié via éditeur » et la nouvelle
   description sont bien présents → persistance confirmée.
5. Même séquence pour À propos/équipe : création d'un membre, publication
   visuelle de la page « about » avec ce membre → `HTTP 200`, rechargement
   confirmant la persistance du nom et du rôle modifiés.

## 2. Correctif crash null — preuve avant/après

**Commande** : `node --test tests/media-normalize.test.ts` → 14/14 tests
verts, incluant une reproduction directe du cas réel (chapitre avec
`media: [null, {id:3,...}, undefined]`).

**Scénario réel exécuté** :

1. Injection directe, via l'API CMS classique, d'un contenu `work` dont un
   chapitre contient `"media":[null, {"id":1,"alt":"Test"}, null]`.
2. **Avec le code d'origine** : `GET /notre-travail` → **`HTTP 500`**, message
   d'erreur serveur exact : **`Cannot read properties of null (reading 'id')`**
   — confirmation exacte du bug décrit dans l'audit.
3. **Avec le code corrigé** : la même page, avec les mêmes données en base
   (aucune donnée modifiée entre les deux essais) → **`HTTP 200`**, le
   chapitre « Les préparatifs » s'affiche normalement.

## 3. Correctif pipeline d'upload — preuve fonctionnelle

**Commande** : `node --test tests/upload-limits.test.ts` → 5/5 tests verts,
dont un test démontrant explicitement que l'ancienne marge (640 Ko/700 Ko)
ne satisfait pas le seuil minimal retenu pour cette phase.

**Scénario réel exécuté** (image de test valide, PNG 1×1, 68 octets) :

1. Séquence complète reproduisant exactement le protocole du client :
   `mode=variant` pour `thumbnail`, `mobile`, `desktop` (chacun `HTTP 201`),
   puis `mode=finalize` pour `original` (`HTTP 201`,
   `{"ok":true,"id":1,"state":"complete"}`) — cette dernière étape passe par
   la nouvelle vérification `d1-verify` avant de répondre.
2. Média confirmé récupérable : `GET /api/media/1?variant=thumbnail` →
   `HTTP 200`, contenu binaire correct (68 octets).
3. Média visible dans la médiathèque admin : `GET /api/admin/cms?resource=media`
   liste bien l'entrée `{id:1, name:"tiny.png", type:"image", size:68}`.
4. Rejet correct d'un fichier surdimensionné (650 Ko > 600 Ko) :
   `HTTP 413` `{"error":"Image trop volumineuse après optimisation."}`.
5. Rejet correct d'un format non supporté (`application/pdf`) :
   `HTTP 415` `{"error":"Format non supporté..."}`.
6. Action `abort-upload` : appelée avec une clé de variante déjà stockée →
   `HTTP 200` `{"ok":true}`, sans erreur ; sans authentification →
   `HTTP 401` (protégée comme toute route `/api/admin/*`).

**Ce qui n'a pas pu être testé automatiquement dans ce bac à sable** :

- La **compression client réelle** (`createImageBitmap`/`canvas.toBlob`)
  s'exécute dans un navigateur : aucun navigateur piloté n'était disponible
  ici pour uploader une vraie photo haute résolution et observer la
  compression progressive en conditions réelles. La logique a été revue et
  bornée (voir `CHANGELOG_PHASE1.md`), mais **une vérification manuelle avec
  de vraies photos (JPEG léger, PNG, image haute résolution 24 Mpx, upload
  multiple) reste nécessaire avant mise en production**, comme le prévoyait
  déjà `AUDIT_TEST_CHECKLIST.md` fourni par l'équipe.
- Le comportement exact de la plateforme de production face à un corps
  multipart proche de la limite ~1 Mio n'est pas reproductible dans ce bac à
  sable (Miniflare n'impose pas cette limite spécifique à la plateforme
  d'hébergement réelle) : la marge a été augmentée par prudence documentée
  (voir `lib/upload-limits.ts`), mais seul un test en environnement de
  préproduction réel confirmera qu'elle suffit dans tous les cas.
- Le filet de sécurité `UPLOAD_WATCHDOG_MS` (45 s) n'a pas pu être déclenché
  volontairement dans ce bac à sable (nécessiterait de simuler une connexion
  qui n'aboutit à aucune réponse HTTP) — sa logique a été relue avec soin
  (minuterie indépendante, `settled`/`clearTimeout` corrects) mais une
  vérification manuelle (ex. couper le réseau pendant un upload) est
  recommandée avant mise en production.
- Logout/login et réutilisation du média dans un projet n'ont pas été rejoués
  ici (couverts fonctionnellement par les tests d'authentification du §4 et
  par la lecture de code du chemin de réutilisation, inchangé par cette
  phase).

## 4. Correctif frontière d'authentification — preuve fonctionnelle

**Commande** : `node --test tests/auth-allowlist.test.ts` → 9/9 tests verts.

**Scénario réel exécuté** (`ADMIN_EMAILS="admin@example.com"`) :

1. Aucun en-tête d'identité → `GET /api/admin/cms?resource=dashboard` →
   `HTTP 401` `{"error":"Accès administrateur requis"}`.
2. En-tête présent mais e-mail hors liste (`intrus@example.com`) →
   `HTTP 401`, **et** ligne de log serveur confirmée :
   `[admin-auth] accès refusé pour un utilisateur authentifié { email: 'intrus@example.com' }`.
3. En-tête présent, e-mail autorisé mais avec casse et espaces différents
   (`"  ADMIN@EXAMPLE.COM  "`) → `HTTP 200` — confirme la normalisation.
4. Chaque route `/api/admin/*` (cms, media, visual-editor, y compris la
   nouvelle action `abort-upload`) a été vérifiée protégée par
   `requireAdminApi()` par lecture de code (inventaire exhaustif dans
   `AUTH_TRUST_MODEL.md`, §3) et par test direct (401 sans en-tête valide).

**Ce que ces tests ne couvrent pas, par nature** : l'authenticité de l'en-tête
`oai-authenticated-user-email` lui-même — c'est-à-dire la garantie que seule
la plateforme d'hébergement peut le positionner. Aucun test, dans ce dépôt ou
ailleurs, ne peut prouver cela depuis le code applicatif seul : c'est
explicitement documenté comme dépendance externe non vérifiable dans
`AUTH_TRUST_MODEL.md` (§5-6). C'est un residual risk assumé, pas une limite
de couverture de test.

## 5. Test de fumée existant du projet (`npm test`)

`npm test` exécute `npm run build` (✅ réussi, voir §6) puis
`node --test tests/rendered-html.test.mjs`, qui importe le bundle Worker
construit et vérifie qu'il répond `200`. Ce test **échoue dans ce bac à
sable** avec :

```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data,
and node are supported by the default ESM loader. Received protocol 'cloudflare:'
```

**Cause confirmée non liée à cette phase** : ce test importe directement le
bundle Worker compilé via `import()`, qui contient des imports
`cloudflare:workers` (présents dans le code **d'origine**, non modifiés par
cette phase — `lib/cms-db.ts`, `worker/index.ts`). Ce schéma d'URL n'est
résolu que par le runtime réel des Cloudflare Workers (ou par Miniflare via
`wrangler`/`vinext start`), jamais par le chargeur ESM standard de Node
utilisé en `node --test` direct. Il s'agit d'une limite de l'environnement
d'exécution de ce test précis dans un bac à sable sans intégration
Workers complète pour ce point d'entrée spécifique — **pas d'une régression
introduite par cette phase** (reproduit à l'identique en pointant le test sur
un build effectué avant tout changement).

Le serveur de développement complet (`npm run dev`, qui utilise Miniflare
correctement pour tout le cycle de requête) fonctionne, lui, parfaitement, et
a servi de base à toutes les vérifications runtime des sections 1 à 4
ci-dessus — c'est la preuve la plus forte disponible dans cet environnement
que l'application fonctionne réellement de bout en bout.

## 6. Vérification différentielle TypeScript/ESLint

`npx tsc --noEmit -p tsconfig.json` et `npx eslint <fichier>` ont été exécutés
sur chaque fichier modifié, **avant et après** modification (en restaurant
temporairement la version d'origine depuis le paquet d'audit fourni), pour
isoler précisément les erreurs pré-existantes de toute régression introduite :

- `app/notre-travail/page.tsx`, `app/visual-editor.tsx`,
  `app/admin/project-manager.tsx`, `app/admin/media-library.tsx`,
  `app/api/admin/media/route.ts`, `lib/visual-editor.ts`,
  `lib/admin-auth.ts`, `lib/public-cms.ts` : **aucune nouvelle erreur
  TypeScript, aucun nouvel avertissement ESLint** introduits par cette phase.
  Deux fichiers (`app/visual-editor.tsx`, `app/admin/project-manager.tsx`,
  `lib/public-cms.ts`) ont même **un avertissement `any` de moins** chacun
  (suppression des fonctions `normalizeGallery` dupliquées).
- Les erreurs TypeScript restantes dans le projet (`app/a-propos/page.tsx`,
  `app/admin/admin-app.tsx`, `app/page.tsx`, `db/index.ts`, `lib/cms-db.ts`,
  `worker/index.ts`) sont **pré-existantes**, confirmées identiques en
  testant les fichiers d'origine non modifiés (absence de
  `@cloudflare/workers-types`/types générées par `wrangler types` dans ce
  paquet, et un écart de typage pré-existant dans `app/a-propos/page.tsx` et
  `app/page.tsx`, tous non liés au périmètre de cette phase).

## Limitations générales de cet environnement de test

- Pas d'accès à un vrai compte Cloudflare/D1/R2 de production, ni à
  ChatGPT/SIWC réel : toute vérification d'authentification s'est faite en
  simulant l'en-tête `oai-authenticated-user-email` directement, ce qui est
  la seule chose testable depuis le code applicatif (voir §4).
- Pas de navigateur piloté disponible : les vérifications mobiles, tactiles,
  et la compression d'image réelle côté navigateur n'ont pas pu être
  rejouées automatiquement (voir §3 et `AUDIT_TEST_CHECKLIST.md`).
- Le test de fumée `npm test` du projet nécessite une intégration Workers
  complète non disponible ici pour son point d'entrée précis (§5) — compensé
  par les vérifications runtime directes des sections 1 à 4, jugées plus
  probantes pour cette phase.

## Étapes manuelles à vérifier avant mise en production

1. Rejouer le scénario du §1 (publication Services/À propos) sur un
   environnement de préproduction réel connecté à un vrai D1.
2. Uploader de vraies photos (JPEG léger, PNG, image très haute résolution,
   upload multiple, connexion lente) depuis un navigateur réel, desktop et
   mobile, pour confirmer la compression et les nouveaux messages d'erreur.
3. Confirmer avec l'équipe/documentation de la plateforme les 4 points de la
   checklist `AUTH_TRUST_MODEL.md` §5 (frontière de confiance de l'en-tête
   d'identité).
4. Vérifier qu'aucun objet R2 orphelin résiduel n'existe déjà en production
   pour d'anciens uploads échoués (hors périmètre du correctif, mais utile à
   savoir avant de déployer le nettoyage `abort-upload`, qui ne s'applique
   qu'aux nouveaux échecs).
