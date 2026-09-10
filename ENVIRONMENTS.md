# Environnements — Divine Motion

Trois environnements strictement séparés, chacun avec ses propres
ressources. **Aucune donnée de production n'est partagée avec staging.**
Aucune ressource réelle n'a été créée par cette phase — ce document définit
la cible, `DEPLOYMENT_OUTSIDE_SITES.md` donne les commandes pour la
provisionner quand vous serez prêt.

## Vue d'ensemble

| | Local | Staging | Production |
|---|---|---|---|
| But | Développement au jour le jour | Tests réels avant mise en ligne | Site public |
| Hébergement | Miniflare (simulateur local, aucun accès Cloudflare requis) | Cloudflare Workers (Worker distinct) | Cloudflare Workers (Worker distinct, celui déjà géré par Sites aujourd'hui) |
| D1 | Simulée par Miniflare (`.wrangler/state/…`, jetable) | Base D1 réelle dédiée, vide au départ | Base D1 réelle (celle déjà utilisée par Sites) |
| R2 | Simulé par Miniflare (jetable) | Bucket R2 réel dédié, vide au départ | Bucket R2 réel (celui déjà utilisé par Sites) |
| Domaine | `localhost:5173` | Sous-domaine dédié, ex. `staging.divinemotion.ca` (ou un domaine temporaire `*.workers.dev` si le domaine définitif n'est pas encore ajouté à Cloudflare — voir `DEPLOYMENT_OUTSIDE_SITES.md`) | Domaine public actuel (`*.chatgpt.site` tant que la bascule n'a pas eu lieu) ou domaine personnalisé une fois choisi |
| Auth admin | En-tête simulé manuellement (voir `LOCAL_DEVELOPMENT.md`) | Selon `AUTH_MIGRATION_PLAN.md` — SIWC tant que non migré, ou la nouvelle méthode en test | SIWC (inchangé tant que la migration n'est pas validée) |
| Secrets | `.dev.vars` (non commité) | Secrets Cloudflare de l'environnement `staging` | Secrets Cloudflare de l'environnement `production`, gérés comme aujourd'hui |
| Qui y touche | Vous | Équipe + revue avant bascule en production | Personne directement — uniquement via déploiement validé depuis `main` |

## Local

Voir `LOCAL_DEVELOPMENT.md` pour la procédure complète. Aucune ressource
Cloudflare réelle n'est nécessaire ni utilisée.

## Staging

**But** : reproduire fidèlement la production (même code, même schéma D1,
mêmes bindings R2) sur des ressources séparées, pour valider une évolution
avant de la déployer réellement.

### Ressources à créer (une seule fois, manuellement — non fait par cette phase)

```bash
npx wrangler d1 create divine-motion-staging
npx wrangler r2 bucket create divine-motion-staging-media
```

Noter le `database_id` retourné par la première commande — il sera utilisé
comme `CF_D1_DATABASE_ID` dans le déploiement (voir
`DEPLOYMENT_OUTSIDE_SITES.md`).

### Structure D1 de staging

**Appliquer uniquement le schéma (`drizzle/*.sql`), jamais un export de
données de production** :

```bash
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0000_fair_lilandra.sql
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0001_steep_kulan_gath.sql
```

Cela donne une base staging **vide**, avec exactement le même schéma que la
production, jamais les mêmes lignes. C'est la stratégie recommandée pour
copier « uniquement la structure » demandée : les migrations `drizzle/*.sql`
**sont** cette structure — les rejouer sur une base staging vide est plus
sûr et plus reproductible qu'un export/import partiel de la production.

### Variables et secrets de staging

| Variable | Valeur | Comment |
|---|---|---|
| `ADMIN_EMAILS` | Adresses de test de l'équipe uniquement | `wrangler secret put ADMIN_EMAILS --config dist/server/wrangler.deploy.json` (jamais commité, jamais dans `vars`) |
| `CF_WORKER_NAME` | `divine-motion-staging` | Utilisée par `scripts/deploy-config.mjs`, définie côté CI/local, pas un secret |
| `CF_D1_DATABASE_NAME` | `divine-motion-staging` | idem |
| `CF_D1_DATABASE_ID` | UUID retourné par `wrangler d1 create` | idem — pas un secret, mais spécifique à l'environnement |
| `CF_R2_BUCKET_NAME` | `divine-motion-staging-media` | idem |
| `CF_ROUTE_PATTERN` | Domaine staging retenu, ex. `staging.divinemotion.ca` (optionnel tant qu'aucun domaine n'est choisi) | idem |
| `CF_ACCESS_TEAM_DOMAIN` | `<équipe>.cloudflareaccess.com` | Non secret ; voir `CLOUDFLARE_ACCESS_SETUP.md`. Absent = SIWC reste le seul chemin (identique à aujourd'hui) |
| `CF_ACCESS_AUD` | Balise AUD de l'application Access | idem — non secrète, identifiant public |

### D1 staging — fiche de référence

| Élément | Valeur |
|---|---|
| Nom de la base | `divine-motion-staging` (à adapter si un autre nom est choisi) |
| Binding | `DB` (identique à tous les environnements — voir `lib/cms-db.ts`) |
| Migrations appliquées | `drizzle/0000_fair_lilandra.sql`, `drizzle/0001_steep_kulan_gath.sql` (schéma complet, aucune donnée) |
| Base de départ | Vide — jamais un export de production |

**Procédure de reset staging** (efface tout le contenu de test, reconstruit
un schéma propre) :

```bash
npx wrangler d1 execute divine-motion-staging --remote \
  --command="DROP TABLE IF EXISTS audit_log; DROP TABLE IF EXISTS inquiry_notes; DROP TABLE IF EXISTS inquiries; DROP TABLE IF EXISTS admin_users; DROP TABLE IF EXISTS team_members; DROP TABLE IF EXISTS services; DROP TABLE IF EXISTS media; DROP TABLE IF EXISTS project_sections; DROP TABLE IF EXISTS projects; DROP TABLE IF EXISTS cms_settings;"
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0000_fair_lilandra.sql
npx wrangler d1 execute divine-motion-staging --remote --file=drizzle/0001_steep_kulan_gath.sql
```

**Procédure de backup staging** (utile avant un test destructif, ou juste
avant un reset) :

```bash
npx wrangler d1 export divine-motion-staging --remote --output backup-staging-$(date +%Y%m%d-%H%M).sql
```

**Données de test** : si des données sont nécessaires pour tester le CMS,
les créer directement via l'admin staging une fois déployé (voir
`STAGING_TEST_REPORT.md`), avec un préfixe explicite `TEST —` dans les
titres/noms (ex. « TEST — Mariage Dupont »), jamais de données réelles de
clients copiées depuis la production.

### R2 staging — fiche de référence

| Élément | Valeur |
|---|---|
| Nom du bucket | `divine-motion-staging-media` |
| Binding | `BUCKET` (identique à tous les environnements) |
| Politique d'accès | Privée (pas de lecture publique directe du bucket) — les médias sont toujours servis via `/api/media/[id]`, jamais par une URL R2 directe (voir `lib/cms-db.ts`, `app/api/media/[id]/route.ts`) |
| Stratégie d'URL média | Inchangée par cette phase : `mediaUrl(id, variant)` → `/api/media/{id}?variant=...`, résolue par le Worker (D1 pour les métadonnées, R2 pour le contenu). Aucune URL n'encode le nom du bucket ni un domaine R2 direct — portable par construction |

**Checklist de vérification R2 staging** (à cocher lors du test réel, voir
`STAGING_TEST_REPORT.md`) : upload, lecture (variantes thumbnail/mobile/
desktop/original), suppression (corbeille), remplacement, et nettoyage
`abort-upload` en cas d'échec d'une séquence — les quatre premiers via
l'admin, le dernier en interrompant volontairement un upload multi-parties
(voir `app/api/admin/media/route.ts`, action `abort-upload`, ajoutée en
Phase 1).

### Ce que staging doit permettre de tester

Site public, admin, éditeur visuel, uploads, projets, demandes, SEO,
publications — c'est-à-dire l'intégralité du parcours couvert par
`AUDIT_TEST_CHECKLIST.md` et `TEST_REPORT_PHASE1.md`, mais sur de vraies
ressources Cloudflare distantes plutôt que sur Miniflare local. Voir
`DEPLOYMENT_OUTSIDE_SITES.md` §« Vérifications post-déploiement staging ».

## Production

**Ne pas créer de nouvelles ressources D1/R2 pour la production.** Celles
utilisées aujourd'hui par ChatGPT Sites (résolues via `project_id` dans
`.openai/hosting.json`, voir `PORTABILITY_AUDIT.md` #4) restent la source de
vérité tant que la bascule hors Sites n'a pas eu lieu. La question « le D1
actuel peut-il être réutilisé » se répond ainsi : **oui, et c'est le seul
choix recommandé** — recréer un D1 de production reviendrait à perdre
l'historique réel (projets, médias, demandes clients) sans aucun bénéfice.

Quand la bascule hors Sites sera décidée (pas dans cette phase), la
procédure sera : obtenir de la plateforme Sites (ou du dashboard Cloudflare
si le compte est déjà partagé) le `database_id` D1 et le nom du bucket R2
réels actuellement utilisés, puis les utiliser comme
`CF_D1_DATABASE_ID`/`CF_R2_BUCKET_NAME` de l'environnement `production` —
**jamais** un nouveau D1/R2 vide. Ce document ne fait que le documenter :
aucune bascule n'est effectuée maintenant.

## Isolation stricte entre environnements

- Trois bases D1 distinctes (locale simulée / staging / production réelle),
  trois buckets R2 distincts. Aucun credential ni binding partagé.
- `ADMIN_EMAILS` de staging ne doit **jamais** contenir les mêmes adresses
  que la production si l'objectif est de tester des rôles/accès — sinon,
  simplement limiter aux comptes de test de l'équipe.
- Aucun script de cette phase ne lit ni n'écrit dans la base de production
  automatiquement. `scripts/deploy-config.mjs` exige que chaque valeur soit
  fournie explicitement (échec fermé si absente) — impossible de déployer
  « par défaut » vers la mauvaise cible par erreur de configuration silencieuse.

## Domaines (aperçu — détail dans `DEPLOYMENT_OUTSIDE_SITES.md` §Domaines)

| Environnement | Domaine prévu | SSL |
|---|---|---|
| Local | `localhost:5173` | N/A |
| Staging | `staging.divinemotion.ca` (cible) ou `<nom-worker>.<compte>.workers.dev` (temporaire, fourni automatiquement par Cloudflare, sans configuration DNS) | Automatique via Cloudflare — y compris sur `workers.dev` |
| Production | Domaine actuel `*.chatgpt.site` jusqu'à bascule, puis domaine personnalisé à choisir | Automatique via Cloudflare |

Aucune modification DNS n'a été faite. Voir `DEPLOYMENT_OUTSIDE_SITES.md`
pour la checklist à suivre le jour où un domaine est choisi.
