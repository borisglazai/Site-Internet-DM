# Modèle de confiance — Authentification admin Divine Motion

Ce document répond au correctif Phase 1 #4 de `AUDIT_DIVINE_MOTION.md`. Il ne
change pas le mécanisme d'authentification (Sign in with ChatGPT / SIWC) : il
documente explicitement sur quoi repose sa sécurité, pour que ce ne soit plus
une hypothèse implicite mais un point vérifié et vérifiable.

## 1. Qui injecte l'en-tête, et où

`app/chatgpt-auth.ts` lit l'en-tête HTTP `oai-authenticated-user-email` (et
optionnellement `oai-authenticated-user-full-name` /
`-full-name-encoding`) sur **chaque requête entrante du Worker**. Cet en-tête
est censé être injecté par la couche de dispatch de la plateforme d'hébergement
Sites (le composant qui route les requêtes vers ce Worker), après un flux
« Sign in with ChatGPT » (SIWC) réussi. Le code applicatif ne réalise lui-même
aucune étape d'authentification : ni mot de passe, ni session propre, ni
vérification cryptographique de cet en-tête.

`lib/admin-auth.ts` (`getAuthorizedAdmin`) ajoute la seule vérification qui
relève du code applicatif : l'e-mail affirmé par cet en-tête doit figurer,
après normalisation (`trim` + minuscule), dans la variable d'environnement
serveur `ADMIN_EMAILS` (liste fermée, séparée par des virgules, jamais fournie
par le client). Cette comparaison est isolée dans `lib/auth-allowlist.ts`
(fonction pure, testée indépendamment — voir `tests/auth-allowlist.test.ts`).

## 2. Pourquoi l'application lui fait confiance

Ce projet est conçu pour tourner **exclusivement** derrière le dispatcher de
la plateforme Sites. Le contrat implicite est :

- un visiteur ne peut jamais atteindre ce Worker sans passer par ce
  dispatcher ;
- ce dispatcher est le seul composant autorisé à positionner l'en-tête
  `oai-authenticated-user-email`, et il ne le fait qu'après une authentification
  SIWC réelle ;
- tout en-tête `oai-authenticated-user-*` porté par la requête **avant**
  qu'elle n'atteigne le dispatcher est supposé être écrasé/retiré par celui-ci
  avant réinjection.

Le code applicatif ne peut pas vérifier lui-même que ce contrat est respecté
— il n'a par construction aucune visibilité sur la façon dont la requête lui
est parvenue. **C'est pourquoi ce point doit être garanti au niveau de la
plateforme, pas du code.**

## 3. Routes et surfaces qui dépendent de cette frontière

Inventaire vérifié dans le code (grep exhaustif, pas une estimation) :

| Surface | Fonction utilisée | Effet si la frontière est franchie |
|---|---|---|
| `POST /api/admin/cms` | `requireAdminApi()` | Lecture/écriture complète du CMS (projets, services, équipe, demandes, réglages, corbeille) |
| `POST/PATCH/DELETE /api/admin/media` | `requireAdminApi()` | Upload, remplacement, suppression de médias en R2/D1 |
| `POST /api/admin/visual-editor` | `requireAdminApi()` | Sauvegarde de brouillon, publication, restauration de tout contenu public |
| `GET /api/admin/editor-session` | `getAuthorizedAdmin()` (redirige vers `/admin` si absent) | Active/désactive le cookie global d'édition |
| `/admin` (page) | `getChatGPTUser()` puis `getAuthorizedAdmin()` | Accès à l'interface CMS complète |
| `/`, `/notre-travail`, `/services`, `/a-propos`, `/contact`, `/projets/[slug]` | `getAuthorizedAdmin()` / `getEditorState()` | N'affichent l'éditeur visuel et ne chargent la médiathèque que si l'appelant est reconnu admin — ces pages restent, par ailleurs, protégées par leurs propres filtres `published/visible` pour tout visiteur non admin |

Aucune route `/api/admin/*` ne contourne `requireAdminApi()` : chacune l'appelle
en tout premier, avant tout accès D1/R2.

## 4. Risque si l'en-tête est falsifiable

Si un chemin quelconque permet à un client de positionner lui-même
`oai-authenticated-user-email` (ex. : le Worker devient atteignable par une
route qui ne passe pas par le dispatcher, un proxy intermédiaire mal
configuré transmet les en-têtes du client sans les filtrer, ou une régression
côté plateforme cesse de les écraser), alors **n'importe quel visiteur peut se
déclarer administrateur** en indiquant l'e-mail de son choix — y compris une
adresse figurant dans `ADMIN_EMAILS`. Cela donne un accès complet et immédiat
au CMS, aux médias et aux demandes clients. Il n'existe aucune deuxième ligne
de défense applicative contre ce scénario précis, par conception (voir
section 6).

## 5. Garanties à faire confirmer côté plateforme

Checklist à valider avec l'équipe/documentation de la plateforme Sites, et à
conserver avec ce document :

1. Le Worker n'est atteignable que via le dispatcher SIWC — aucune route
   d'accès directe (ex. `*.workers.dev` public, domaine personnalisé mal
   routé) ne le contourne.
2. Le dispatcher **retire systématiquement** tout en-tête
   `oai-authenticated-user-*` fourni par le client avant de le réinjecter
   lui-même après authentification (sinon un client peut le forger).
3. Aucune règle de cache (CDN, cache Worker, cache de plateforme) ne peut
   mémoriser puis rejouer une réponse authentifiée pour un autre visiteur.
4. La rotation de `ADMIN_EMAILS` (retrait d'un accès compromis) prend effet
   sans délai de cache côté plateforme.

Tant que ces points n'ont pas de confirmation écrite de la plateforme, ils
doivent être traités comme des hypothèses de sécurité non vérifiées, pas
comme des faits acquis.

## 6. Défense en profondeur ajoutée en Phase 1 — et ses limites

Sans toucher au mécanisme SIWC, la Phase 1 apporte les garde-fous suivants,
tous côté application :

- **Échec fermé systématique** : `isEmailAllowed()` retourne `false` si
  `ADMIN_EMAILS` est vide/absent — un oubli de configuration bloque l'accès
  au lieu de l'ouvrir (comportement déjà présent, désormais isolé et testé).
- **Normalisation stricte** : comparaison insensible à la casse et aux
  espaces, sur la liste serveur uniquement — jamais sur une valeur envoyée
  par le client.
- **Aucun rôle ni permission n'est jamais lu depuis une valeur contrôlée par
  le client.** Il n'existe qu'un seul niveau d'accès (administrateur complet)
  — c'est un choix de simplicité déjà documenté dans `AUDIT_DIVINE_MOTION.md`
  (table `admin_users`/`role` non utilisée) et volontairement **non traité**
  en Phase 1 (voir consigne « ne pas traiter les rôles complets »).
- **Journalisation des refus** : `getAuthorizedAdmin()` journalise (log
  serveur, pas de table dédiée) chaque refus pour un utilisateur authentifié
  mais non autorisé, ce qui aide à détecter un sondage de `/admin` ou l'usage
  d'un compte retiré de l'allowlist.
- **Couverture vérifiée** : chaque route `/api/admin/*` appelle
  `requireAdminApi()` avant tout accès D1/R2 (inventaire section 3).

**Ce que cela ne fait pas** : aucune de ces mesures ne protège contre le
scénario de la section 4. Sans une garantie cryptographique de la plateforme
(signature de l'en-tête, jeton vérifiable côté Worker — actuellement absents
de ce paquet), le code applicatif ne peut pas prouver par lui-même qu'un
en-tête `oai-authenticated-user-email` est authentique. Conformément à la
consigne de cette phase, **aucune cryptographie maison n'a été ajoutée** pour
combler ce point : la sécurité de l'ensemble dépend, in fine, de la
plateforme. C'est un residual risk explicite, pas un oubli — voir
`CHANGELOG_PHASE1.md` et `TEST_REPORT_PHASE1.md`.
