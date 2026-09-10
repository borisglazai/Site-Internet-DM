# Déploiement — Phase 1

Ce document donne les étapes exactes pour appliquer les correctifs de la
Phase 1 dans le projet de production (ChatGPT Sites). **Il ne remplace pas**
une revue humaine du diff : voir `CHANGELOG_PHASE1.md` pour le détail de
chaque changement et `TEST_REPORT_PHASE1.md` pour les preuves de
vérification déjà effectuées.

## Aucune migration de base de données requise

Les 4 correctifs de cette phase sont uniquement du code applicatif. **Aucune
commande de migration D1 n'est nécessaire** — le correctif #1 retire une
écriture vers une colonne inexistante plutôt que d'ajouter une colonne (voir
`CHANGELOG_PHASE1.md`, section 1, pour la justification de ce choix).

## Prérequis

- Node.js `>=22.13.0`, comme documenté dans `README.md`.
- Un accès à l'environnement de préproduction (D1/R2 de test), distinct de
  la production, conformément à `AUDIT_TEST_CHECKLIST.md`.

## Étapes

### 1. Intégrer les fichiers modifiés

Fichiers modifiés (à remplacer intégralement) :

```
lib/visual-editor.ts
lib/public-cms.ts
lib/admin-auth.ts
app/visual-editor.tsx
app/admin/project-manager.tsx
app/admin/media-library.tsx
app/api/admin/media/route.ts
app/notre-travail/page.tsx
tsconfig.json
```

Nouveaux fichiers (à ajouter) :

```
lib/media-normalize.ts
lib/upload-limits.ts
lib/auth-allowlist.ts
AUTH_TRUST_MODEL.md
tests/media-normalize.test.ts
tests/auth-allowlist.test.ts
tests/upload-limits.test.ts
tests/schema-sql-consistency.test.ts
```

Si l'intégration se fait par une branche Git plutôt que par copie de
fichiers, appliquer le diff normalement (`git apply`/merge/cherry-pick selon
le flux de l'équipe) — aucun fichier hors de cette liste n'a été modifié.

### 2. Installer les dépendances et vérifier

```bash
npm ci
npx tsc --noEmit -p tsconfig.json   # attendu : uniquement les erreurs pré-existantes listées dans TEST_REPORT_PHASE1.md §6
npm run lint                          # attendu : aucune nouvelle erreur sur les fichiers listés ci-dessus
npm run test:unit                     # attendu : 32/32 tests verts
```

### 3. Construire

```bash
npm run build
```

Doit se terminer par `Build complete. Run 'vinext start' to start the
production server.` sans erreur. C'est la même commande que la plateforme
Sites exécute contre le commit poussé (voir `README.md`).

### 4. Vérifier en préproduction (obligatoire avant production)

Avec un environnement de préproduction (D1/R2 de test, `ADMIN_EMAILS` pointant
vers un compte de test) :

1. Rejouer le scénario de `TEST_REPORT_PHASE1.md` §1 : créer un service,
   publier la page Services depuis l'éditeur visuel, recharger, vérifier la
   persistance. Répéter pour un membre d'équipe / page À propos.
2. Uploader une vraie photo (JPEG et PNG, y compris une image haute
   résolution) depuis un navigateur réel, desktop et mobile ; confirmer
   qu'elle apparaît dans la médiathèque et reste utilisable dans un projet.
3. Confirmer qu'un visiteur non authentifié reçoit bien un refus sur
   `/admin` et sur toute route `/api/admin/*`.
4. Lire `AUTH_TRUST_MODEL.md` avec l'équipe/documentation de la plateforme
   Sites et cocher les 4 points de la checklist de confiance (section 5) —
   ce n'est pas bloquant pour déployer le code, mais doit être fait avant de
   considérer le risque d'authentification comme traité.

### 5. Déployer

Suivre le flux habituel de la plateforme Sites (checkpoint / push vers le
dépôt suivi par le contrôleur de build Sites, comme documenté dans
`README.md`) — cette phase ne change rien à ce flux. **Ce document ne
déclenche aucun déploiement lui-même** ; la mise en production reste une
action humaine séparée, comme demandé.

### 6. Vérifier après déploiement

- Publier un vrai changement sur la page Services ou À propos depuis
  l'éditeur visuel en production, et confirmer qu'il persiste après
  rechargement.
- Uploader un média réel et vérifier son apparition dans la médiathèque.
- Surveiller les journaux serveur pendant les premières 24–48 h pour les
  nouvelles lignes `[media-upload]` et `[admin-auth] accès refusé…` — elles
  sont conçues pour aider au diagnostic si un problème apparaît malgré les
  vérifications ci-dessus.

## Rotation de `ADMIN_EMAILS`

Aucun changement à la procédure existante : `ADMIN_EMAILS` reste une variable
d'environnement serveur, à modifier via la plateforme d'hébergement. Le
correctif #4 n'ajoute aucune nouvelle variable ni secret.
