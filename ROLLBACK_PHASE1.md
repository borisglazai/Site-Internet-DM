# Rollback — Phase 1

Comment revenir en arrière si le déploiement des correctifs Phase 1 cause un
problème en production.

## Pourquoi le rollback est simple ici

Aucune migration de base de données n'a été appliquée (voir
`DEPLOYMENT_PHASE1.md`) : les 4 correctifs sont uniquement du code
applicatif, sans changement de schéma D1 ni de format de données stockées.
**Revenir au code précédent suffit** — aucune étape de restauration de
données n'est nécessaire.

## Procédure

### Si le déploiement se fait via Git (recommandé)

```bash
# Identifier le commit précédent (avant l'intégration de la Phase 1)
git log --oneline

# Revenir à ce commit sur la branche de déploiement
git revert <commit-phase-1>       # préserve l'historique (recommandé)
# ou, si la plateforme le permet et qu'aucun autre commit n'a suivi :
git reset --hard <commit-avant-phase-1>
```

Puis redéployer via le flux habituel de la plateforme Sites (checkpoint /
push), exactement comme pour tout déploiement normal.

### Si l'intégration a été faite par copie de fichiers

Restaurer les fichiers listés dans `DEPLOYMENT_PHASE1.md` (section
« Fichiers modifiés ») à leur version précédente, et supprimer les fichiers
listés dans « Nouveaux fichiers ». Reconstruire (`npm run build`) et
redéployer.

## Vérification après rollback

1. `npm run build` réussit.
2. `/admin` et les routes `/api/admin/*` répondent comme avant (401 sans
   authentification, accès normal pour un admin autorisé).
3. Les pages publiques (`/`, `/notre-travail`, `/services`, `/a-propos`,
   `/contact`, `/projets/[slug]`) répondent normalement.

## Ce qui redevient vrai après un rollback (à savoir)

Revenir en arrière **réintroduit** les 4 problèmes bloquants documentés dans
`AUDIT_DIVINE_MOTION.md` :

- la publication visuelle des pages Services et À propos échouera de nouveau
  dès qu'un service ou un membre d'équipe existant y est modifié ;
- `/notre-travail` redevient vulnérable au crash si un `null` se trouve dans
  un tableau de médias d'un chapitre (déjà arrivé une fois d'après le
  contexte fourni) ;
- le pipeline d'upload redevient aussi fragile qu'avant (marge de ~9 %
  seulement, pas de filet de sécurité indépendant du timeout XHR) ;
- la documentation du modèle de confiance d'authentification
  (`AUTH_TRUST_MODEL.md`) disparaît, et la journalisation des refus d'accès
  admin n'est plus active — un rollback ne réintroduit toutefois **aucun**
  nouveau risque de sécurité par lui-même (le comportement d'autorisation
  effectif ne changeait pas dans le correctif #4, voir `CHANGELOG_PHASE1.md`).

Si le problème motivant le rollback est sans rapport avec l'un des 4
correctifs (ex. un problème de plateforme, de build, ou d'un tout autre
changement déployé en même temps), il est préférable d'identifier et de
corriger ce problème précis plutôt que de perdre ces correctifs — les
recontacter/réappliquer plus tard demande de refaire tout le travail de
vérification déjà documenté dans `TEST_REPORT_PHASE1.md`.

## Aucune action sur les secrets

`ADMIN_EMAILS` et tout autre secret de la plateforme ne sont affectés ni par
le déploiement ni par le rollback de cette phase.
