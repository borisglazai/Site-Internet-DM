# Rollback — Déploiement hors ChatGPT Sites

Procédure de retour en arrière pour un déploiement fait via
`DEPLOYMENT_OUTSIDE_SITES.md` (staging ou production sur Cloudflare direct).
Ne concerne pas le flux ChatGPT Sites existant, qui garde son propre
mécanisme de rollback indépendant.

## Principe

Le code applicatif et les données (D1/R2) sont **découplés** : redéployer
une ancienne version du code ne touche ni au contenu D1 ni aux fichiers R2
(aucune migration destructive n'existe dans ce projet — voir
`ROLLBACK_PHASE1.md` pour la même garantie côté Phase 1). Un rollback de
déploiement hors Sites est donc, presque toujours, un simple **retour à un
commit précédent + redéploiement**, sans aucune action sur D1/R2.

## Revenir au commit précédent

```bash
git log --oneline                  # identifier le dernier commit sain
git checkout <commit-sain>          # ou une branche dédiée si préféré
npm ci
npm run build
CF_WORKER_NAME=... CF_D1_DATABASE_NAME=... CF_D1_DATABASE_ID=... CF_R2_BUCKET_NAME=... \
  npm run deploy:config
npx wrangler deploy --config dist/server/wrangler.deploy.json --dry-run   # vérifier
npx wrangler deploy --config dist/server/wrangler.deploy.json            # redéployer
```

Ou, via GitHub Actions : relancer manuellement *Deploy (staging)* ou
*Deploy (production)* (`workflow_dispatch`) depuis le commit/branche sain —
GitHub permet de choisir la référence Git au lancement du workflow.

## Ne pas casser D1

- Aucune commande de migration destructive n'est exécutée par le
  déploiement lui-même (`wrangler deploy` ne touche jamais au contenu D1).
- Un rollback de code n'annule **jamais** automatiquement une migration de
  schéma déjà appliquée. Si un rollback suit une migration `drizzle/*.sql`
  problématique : traiter cela séparément, avec une migration de correction
  explicite (jamais en supprimant/recréant la base), et seulement après
  sauvegarde (voir ci-dessous).
- Avant toute opération risquée sur une base réelle (staging comme
  production), exporter un instantané :
  ```bash
  npx wrangler d1 export <nom-de-la-base> --output backup-$(date +%Y%m%d-%H%M).sql
  ```

## Ne pas perdre les médias

- R2 n'est jamais vidé ni recréé par un rollback de code — les objets
  existants restent en place quel que soit le commit déployé.
- Le nettoyage `abort-upload` ajouté en Phase 1
  (`app/api/admin/media/route.ts`) ne supprime que des objets liés à un
  upload explicitement en échec, jamais en bloc — aucun risque de perte
  massive lié à un rollback.
- Si un doute existe sur l'état d'un bucket avant une opération sensible,
  lister son contenu avant/après :
  ```bash
  npx wrangler r2 object list <nom-du-bucket>
  ```

## Rollback d'un déploiement raté en cours

Si `wrangler deploy` échoue en cours d'exécution (réseau, quota, erreur de
configuration) : Cloudflare Workers déploie de façon atomique — un déploiement
qui échoue **ne remplace pas** la version actuellement servie. Aucune action
de rollback n'est nécessaire dans ce cas ; corriger la cause de l'échec et
relancer.

Si un déploiement a **réussi** mais introduit une régression constatée
après coup : revenir au commit précédent et redéployer (procédure
ci-dessus) est plus sûr et plus simple qu'un `wrangler rollback` sur une
version antérieure du Worker (fonctionnalité native de Cloudflare, mais qui
ne recompile pas le code depuis Git — préférer le redéploiement depuis un
commit connu pour garder Git comme source de vérité unique).

## Checklist de rollback

1. Identifier le dernier commit/déploiement sain.
2. Vérifier qu'aucune migration D1 incompatible n'a été appliquée entre les
   deux (sinon, traiter séparément — voir ci-dessus).
3. Construire et déployer ce commit (procédure ci-dessus).
4. Vérifier que le site répond normalement (accueil, admin via `curl`,
   lecture média).
5. Ne rien faire côté D1/R2 sauf si un problème de données est
   spécifiquement identifié — dans ce cas, traiter à part, avec sauvegarde
   préalable.

## Ce que ce document ne couvre pas

Le rollback de l'authentification (si `AUTH_MIGRATION_PLAN.md` a été mis en
œuvre) est traité dans ce même plan, section « Rollback » — il suit le même
principe (retour à un commit antérieur) mais implique aussi de vérifier
qu'une politique Cloudflare Access n'a pas été laissée active alors que le
code qui la vérifie a été retiré.
