# Mise en place du staging Divine Motion — playbook

Playbook séquentiel pour créer l'environnement staging de bout en bout.
**À exécuter par vous** (ou votre équipe) avec vos identifiants Cloudflare —
cette session n'y a pas accès. Chaque étape renvoie vers le document
détaillé correspondant. Rien de tout cela ne touche à la production ni au
domaine public actuel.

Prérequis : compte Cloudflare avec Workers/D1/R2 activés,
`npx wrangler login` effectué localement (ou un `CLOUDFLARE_API_TOKEN` pour
CI), Node.js `>=22.13.0`.

## Étape 0 — Récupérer le code

```bash
git clone <url-du-dépôt>
cd Site-Internet-DM
git checkout staging   # ou la branche préparée pour cette phase
npm ci
```

## Étape 1 — Créer les ressources Cloudflare (D1 + R2)

```bash
npx wrangler d1 create divine-motion-staging
# noter le "database_id" retourné
npx wrangler r2 bucket create divine-motion-staging-media
```

Détail complet, y compris reset/backup : `ENVIRONMENTS.md` §Staging.

## Étape 2 — Appliquer le schéma D1 (structure uniquement, aucune donnée)

```bash
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0000_fair_lilandra.sql
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0001_steep_kulan_gath.sql
```

Vérifier :

```bash
npx wrangler d1 execute divine-motion-staging --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

→ doit lister les 10 tables (`cms_settings`, `projects`, `project_sections`,
`media`, `services`, `team_members`, `inquiries`, `admin_users`,
`inquiry_notes`, `audit_log`).

## Étape 3 — Domaine (optionnel pour un premier essai)

Sans domaine personnalisé, Cloudflare fournit automatiquement une URL
`<nom-worker>.<compte>.workers.dev` au déploiement — suffisant pour valider
techniquement tout le staging avant de brancher un vrai domaine. Pour
`staging.divinemotion.ca` : ajouter la zone `divinemotion.ca` à Cloudflare
si ce n'est pas déjà fait (aucune action sur le DNS de production
existante). Détail : `DEPLOYMENT_OUTSIDE_SITES.md` §Domaines.

## Étape 4 — Configurer GitHub (Environment "staging")

Repo GitHub → Settings → Environments → New environment → `staging`.

Secrets :
```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Variables :
```
CF_WORKER_NAME       = divine-motion-staging
CF_D1_DATABASE_NAME  = divine-motion-staging
CF_D1_DATABASE_ID    = <uuid de l'étape 1>
CF_R2_BUCKET_NAME    = divine-motion-staging-media
CF_ROUTE_PATTERN     = staging.divinemotion.ca      # omettre si étape 3 non faite
```

Détail complet : `DEPLOYMENT_OUTSIDE_SITES.md` §2.

## Étape 5 — Premier déploiement (sans Cloudflare Access pour l'instant)

Objectif : valider que le site public + le CMS via SIWC-absent-donc-API-seule
fonctionnent avant d'ajouter Access par-dessus.

```bash
npm run build
CF_WORKER_NAME=divine-motion-staging \
CF_D1_DATABASE_NAME=divine-motion-staging \
CF_D1_DATABASE_ID=<uuid> \
CF_R2_BUCKET_NAME=divine-motion-staging-media \
CF_ROUTE_PATTERN=staging.divinemotion.ca \
  npm run deploy:config
npx wrangler deploy --config dist/server/wrangler.deploy.json --dry-run   # vérifier
npx wrangler deploy --config dist/server/wrangler.deploy.json
npx wrangler secret put ADMIN_EMAILS --config dist/server/wrangler.deploy.json
```

Ou via GitHub Actions : Actions → *Deploy (staging)* → Run workflow (voir
`.github/workflows/deploy-staging.yml`, déclenchement manuel uniquement).

## Étape 6 — Vérification de base (site public)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://staging.divinemotion.ca/
curl -s -o /dev/null -w "%{http_code}\n" https://staging.divinemotion.ca/notre-travail
curl -s -o /dev/null -w "%{http_code}\n" https://staging.divinemotion.ca/services
curl -s -o /dev/null -w "%{http_code}\n" https://staging.divinemotion.ca/a-propos
curl -s -o /dev/null -w "%{http_code}\n" https://staging.divinemotion.ca/contact
```

→ tous doivent répondre `200`, avec un rendu visuellement identique au site
actuel (voir `STAGING_TEST_REPORT.md` pour la checklist complète).

## Étape 7 — API admin via l'allowlist seule (avant Cloudflare Access)

À ce stade, ni SIWC ni Access ne sont disponibles sur staging — c'est
normal et attendu. Valider que les routes sont bien protégées :

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://staging.divinemotion.ca/api/admin/cms?resource=dashboard
# -> 401 attendu (aucune identité)
```

## Étape 8 — Cloudflare Access

Suivre `CLOUDFLARE_ACCESS_SETUP.md` en entier (création de l'équipe Zero
Trust, application Access sur `/admin*` et `/api/admin/*`, politique
d'allowlist, récupération du Team Domain et de l'AUD Tag).

Puis ajouter au GitHub Environment `staging` :

```
CF_ACCESS_TEAM_DOMAIN = <équipe>.cloudflareaccess.com
CF_ACCESS_AUD          = <AUD Tag>
```

Redéployer (répéter l'étape 5 — `scripts/deploy-config.mjs` les injecte
automatiquement dans la configuration).

## Étape 9 — Validation complète

Suivre `STAGING_TEST_REPORT.md` (checklist des sections 10 à 16 de la
demande : site public, admin, éditeur visuel, médias réels, CMS, formulaire
public, sécurité) et y consigner les résultats.

## Étape 10 — Décision

Une fois `STAGING_TEST_REPORT.md` rempli : revenir vers moi (ou l'équipe)
avec les résultats pour décider de la suite — cette phase s'arrête ici,
sans bascule de production, comme demandé.

## Rappel des interdits de cette phase

- Aucune ressource de production n'est touchée par ce playbook.
- `CF_D1_DATABASE_ID`/`CF_R2_BUCKET_NAME` de production ne doivent **jamais**
  être utilisés dans l'Environment GitHub `staging`.
- SIWC n'est retiré nulle part.
- Aucun DNS de production n'est modifié.
