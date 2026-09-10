# Déploiement hors ChatGPT Sites

Ce document décrit comment déployer Divine Motion directement sur
Cloudflare Workers, en parallèle du flux ChatGPT Sites existant (qui
continue de fonctionner sans changement). **Rien n'a été déployé par cette
phase** : ce qui suit est une procédure prête à l'emploi, à exécuter
volontairement. Pour une checklist séquentielle prête à suivre du premier
au dernier pas, voir `STAGING_SETUP.md` — ce document-ci en est la
référence détaillée.

## Ce que cette phase a préparé, concrètement

- `npm run build` produit un Worker Cloudflare valide (`dist/server/index.js`
  + `dist/client/`), **vérifié fonctionnel** dans cet environnement, sans
  aucun accès à ChatGPT Sites.
- `scripts/deploy-config.mjs` transforme la configuration générée par le
  build (qui contient des identifiants D1/R2 placeholder — voir
  `PORTABILITY_AUDIT.md` #12) en une configuration Wrangler réelle,
  spécifique à un environnement (staging ou production), à partir de
  variables d'environnement.
- `npx wrangler deploy --config dist/server/wrangler.deploy.json --dry-run`
  a été **exécuté avec succès** dans cette phase (bindings D1/BUCKET
  reconnus, 26 fichiers d'assets détectés, bundle Worker de 875 Kio validé)
  — la seule chose qui manque pour un vrai déploiement est un compte
  Cloudflare et de vraies ressources.
- Deux workflows GitHub Actions (`deploy-staging.yml`, `deploy-production.yml`)
  encapsulent cette procédure, **déclenchement manuel uniquement**
  (`workflow_dispatch`) — aucun déploiement automatique n'est actif.

## Prérequis

- Un compte Cloudflare avec Workers, D1 et R2 activés.
- `CLOUDFLARE_API_TOKEN` (permissions Workers Scripts:Edit, D1:Edit,
  Workers R2 Storage:Edit) et `CLOUDFLARE_ACCOUNT_ID`.
- Node.js `>=22.13.0` (identique au reste du projet).

## 1. Provisionner les ressources (une fois par environnement)

Voir `ENVIRONMENTS.md` pour le détail staging/production. Pour staging :

```bash
npx wrangler d1 create divine-motion-staging
npx wrangler r2 bucket create divine-motion-staging-media
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0000_fair_lilandra.sql
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0001_steep_kulan_gath.sql
```

Pour la production : **ne pas créer de nouvelles ressources** — réutiliser
celles déjà en service via ChatGPT Sites (voir `ENVIRONMENTS.md`,
section Production, et §14 « Données » ci-dessous).

## 2. Configurer les secrets et variables (GitHub Environments)

Dans les paramètres du dépôt GitHub, créer deux **Environments** :
`staging` et `production`.

Pour chacun :

**Secrets** (chiffrés, jamais visibles) :
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Variables** (visibles, non secrètes — noms de ressources) :
- `CF_WORKER_NAME` (ex. `divine-motion-staging` / `divine-motion-studio`)
- `CF_D1_DATABASE_NAME`
- `CF_D1_DATABASE_ID`
- `CF_R2_BUCKET_NAME`
- `CF_ROUTE_PATTERN` (optionnel, nom d'hôte du domaine personnalisé)
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` (staging uniquement pour
  l'instant — voir `CLOUDFLARE_ACCESS_SETUP.md`. Non secrets, mais
  spécifiques à l'environnement)

Pour `production`, activer en plus la protection **« Required reviewers »**
sur l'Environment (Settings → Environments → production → Deployment
protection rules) : cela impose une approbation humaine avant que le
workflow ne s'exécute, même déclenché manuellement — c'est le mécanisme de
« validation contrôlée » demandé.

**`ADMIN_EMAILS`** n'est **jamais** une variable GitHub : c'est un secret
Worker, posé directement sur Cloudflare, séparément par environnement :

```bash
npx wrangler secret put ADMIN_EMAILS --config dist/server/wrangler.deploy.json
```

(nécessite d'avoir déjà lancé `npm run build` puis
`node scripts/deploy-config.mjs` avec les bonnes variables pour
l'environnement visé, afin que ce fichier de config existe).

## 3. Déployer manuellement (première fois, en local)

```bash
npm run build
CF_WORKER_NAME=divine-motion-staging \
CF_D1_DATABASE_NAME=divine-motion-staging \
CF_D1_DATABASE_ID=<uuid retourné par wrangler d1 create> \
CF_R2_BUCKET_NAME=divine-motion-staging-media \
  npm run deploy:config
npx wrangler deploy --config dist/server/wrangler.deploy.json --dry-run   # vérifier d'abord
npx wrangler deploy --config dist/server/wrangler.deploy.json            # déployer réellement
```

## 4. Déployer via GitHub Actions (une fois les secrets configurés)

Onglet **Actions** du dépôt → sélectionner *Deploy (staging)* ou
*Deploy (production)* → *Run workflow*. Les deux sont en déclenchement
manuel — voir les commentaires dans chaque fichier `.github/workflows/deploy-*.yml`
pour l'étape à suivre le jour où l'équipe veut activer le déploiement
automatique depuis la branche `staging` (changer un seul déclencheur, voir
ce fichier).

## Workflow de branches recommandé

```
feature/*  →  Pull Request  →  staging  →  validation manuelle  →  main
```

- **`main`** : reflète toujours ce qui est (ou peut être) en production.
  Protégée (revue obligatoire avant fusion).
- **`staging`** : préproduction. Toute fusion vers `staging` peut, une fois
  ce flux validé, déclencher `deploy-staging.yml` automatiquement (voir
  §4). C'est là que les correctifs/évolutions sont testés sur de vraies
  ressources Cloudflare avant `main`.
- **branches `feature/*`** : une branche par changement, fusionnée dans
  `staging` via Pull Request (CI `.github/workflows/ci.yml` exécutée sur
  chaque PR).

Procédure : `feature/xxx` → PR vers `staging` → CI verte → fusion → test
réel sur l'environnement staging déployé → si validé, PR de `staging` vers
`main` → fusion → déploiement production **manuel et approuvé**
(`deploy-production.yml`). Volontairement simple (deux branches longues,
pas de Git Flow complet) conformément à la demande.

## Bindings

| Binding | Type | Staging | Production |
|---|---|---|---|
| `DB` | D1 | `divine-motion-staging` | Base D1 déjà utilisée par Sites (voir `ENVIRONMENTS.md`) |
| `BUCKET` | R2 | `divine-motion-staging-media` | Bucket R2 déjà utilisé par Sites |
| `ASSETS` | Assets statiques | `dist/client` (généré au build) | idem |
| `IMAGES` | Cloudflare Images (optionnel) | Non déclaré par défaut — le code se dégrade proprement sans (voir `PORTABILITY_AUDIT.md` #13) | idem |

## Vérifications post-déploiement staging

Reprendre la liste de `TEST_REPORT_PHASE1.md`/`AUDIT_TEST_CHECKLIST.md`,
sur l'URL staging réelle plutôt qu'en local : accueil, admin (voir limite
d'authentification ci-dessous), lecture/écriture D1, upload/lecture R2,
création de projet, publication, formulaire public, demande visible en
admin.

**Authentification sur staging** : sans `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`
configurées, `/admin` sur le Worker staging dépend toujours de l'en-tête
`oai-authenticated-user-email` — qui n'existe **pas** sur un Worker déployé
hors du dispatcher Sites, donc le CMS n'est pas accessible via un navigateur
normal (la vérification JSON `/api/admin/*` reste testable par `curl`, voir
`LOCAL_DEVELOPMENT.md`, fonctionne aussi contre une URL staging distante).
Une fois `CLOUDFLARE_ACCESS_SETUP.md` suivi et ces deux variables
configurées, `/admin` devient utilisable via un navigateur normal, protégé
par Cloudflare Access — voir ce document pour la procédure complète et la
validation.

**Logs** : pour surveiller l'authentification, les uploads, D1/R2 et les
erreurs API en staging sans exposer de contenu sensible :

```bash
npx wrangler tail --config dist/server/wrangler.deploy.json
```

Le code journalise déjà (voir `lib/admin-auth.ts`, `lib/auth/cloudflare-access.ts`,
`app/api/admin/media/route.ts`) les refus d'accès, les rejets de JWT, et les
étapes du pipeline d'upload — jamais de contenu de fichier, de jeton, de
cookie ni de mot de passe (voir ces fichiers pour le détail exact de ce qui
est journalisé).

**Cache** : `middleware.ts` (nouveau, racine du dépôt) applique
`Cache-Control: private, no-store` à `/admin`, `/admin/:path*` et
`/api/admin/:path*` uniquement — aucune route publique n'est concernée.
Ajouté après avoir constaté, par un test réel (`curl -D -`), qu'aucun
en-tête de cache n'était présent sur ces routes. Voir
`STAGING_TEST_REPORT.md`, section A.3, pour le détail avant/après.

## Domaines

Aucune modification DNS n'a été faite. Quand un domaine est choisi :

1. Ajouter la zone du domaine à Cloudflare (si ce n'est pas déjà fait).
2. Réserver un sous-domaine pour staging (ex. `staging.<domaine>`) et, à
   terme, un pour la production (ou le domaine racine).
3. Renseigner `CF_ROUTE_PATTERN` avec ce nom d'hôte (sans chemin ni
   caractère générique — validé par `wrangler deploy --dry-run` dans cette
   phase, voir `PORTABILITY_AUDIT.md`).
4. Le SSL est automatique via Cloudflare dès que le domaine est actif dans
   la zone — aucune configuration manuelle de certificat.
5. Mettre à jour `app/layout.tsx` (`metadataBase`, aujourd'hui codé en dur
   sur le domaine Sites — voir `PORTABILITY_AUDIT.md` #6) **dans un
   correctif dédié**, une fois le domaine choisi — pas dans cette phase.

## Rollback

Voir `ROLLBACK_EXTERNAL_HOSTING.md`.

## Ce que ce document ne fait pas

- Il ne crée aucune ressource Cloudflare.
- Il ne déploie rien.
- Il ne modifie aucune donnée réelle.
- Il ne touche pas à l'authentification actuelle.
