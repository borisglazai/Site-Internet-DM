# Plan de migration de l'authentification admin

Ce document propose une stratégie pour rendre l'accès `/admin` indépendant
de ChatGPT Sites / SIWC. Contexte de sécurité complet dans
`AUTH_TRUST_MODEL.md`.

> **Mise à jour** : la Phase 1 ci-dessous (module de vérification JWT +
> cohabitation SIWC/Access) est **implémentée et testée** depuis la phase
> staging (`lib/auth/cloudflare-access.ts`, `lib/admin-auth.ts`,
> `tests/cloudflare-access.test.ts` — 9 tests, vérification cryptographique
> réelle contre une paire de clés locale, voir `STAGING_TEST_REPORT.md`).
> **Ce qui reste à faire** — et qui nécessite votre compte Cloudflare, non
> disponible dans cette session — c'est la validation **en conditions
> réelles** contre une véritable équipe Cloudflare Access : voir
> `CLOUDFLARE_ACCESS_SETUP.md` et `STAGING_SETUP.md`. L'authentification
> actuelle (SIWC) reste inchangée et pleinement fonctionnelle tant que cette
> validation n'a pas eu lieu — comportement identique à avant si
> `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` ne sont pas configurées sur un
> environnement (le cas de la production Sites actuelle).

## Contrainte de départ

L'authentification actuelle repose sur un en-tête (`oai-authenticated-user-email`)
injecté par le dispatcher ChatGPT Sites. **Aucune route de connexion n'existe
dans le dépôt** — `/signin-with-chatgpt`, `/signout-with-chatgpt` et
`/callback` sont entièrement gérées par la plateforme (voir
`ROUTES_AND_API.md`, `PORTABILITY_AUDIT.md` #3). Remplacer cette
authentification signifie donc **construire un flux de connexion complet**,
pas seulement changer une vérification.

**Dépendance importante à noter dès maintenant** : la plupart des
alternatives sérieuses (à commencer par la recommandée) ne peuvent
s'activer que sur un domaine que l'équipe contrôle réellement dans son
propre compte Cloudflare — pas sur `*.chatgpt.site`, qui reste sous le
contrôle de la plateforme Sites. Cette migration est donc naturellement
séquencée **après** qu'un Worker ait été déployé hors Sites sur un domaine
propre (staging au minimum), pas avant.

## Comparatif des options

### Option A — Cloudflare Access

**Principe** : Cloudflare Zero Trust protège les routes `/admin*` et
`/api/admin/*` au niveau de l'edge, avant même que le Worker ne s'exécute.
Connexion par e-mail à usage unique (OTP), ou SSO (Google, GitHub…), sans
écrire aucune UI de connexion. Cloudflare pose un en-tête vérifiable
cryptographiquement (`Cf-Access-Jwt-Assertion`, JWT signé), que le Worker
peut valider lui-même contre les clés publiques de l'équipe
(`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`) pour une
défense en profondeur réelle — contrairement à l'en-tête SIWC actuel, qui
n'est aujourd'hui **pas vérifiable cryptographiquement par le code**
(voir `AUTH_TRUST_MODEL.md`).

- **Coût** : gratuit jusqu'à 50 utilisateurs (largement suffisant pour « un
  petit nombre d'administrateurs »).
- **Effort** : faible-moyen. Aucune UI de connexion à écrire ; une politique
  Access (liste d'e-mails autorisés — remplace directement `ADMIN_EMAILS`)
  + un petit module de vérification JWT côté Worker pour la défense en
  profondeur (~50-100 lignes, une dépendance légère type `jose`, compatible
  edge runtime).
- **Compatibilité D1/Workers** : totale — Access est une couche Cloudflare
  native, orthogonale à D1/R2/Workers, aucun changement d'architecture.
- **Maintenance** : très faible — gestion des accès via le dashboard
  Cloudflare (ajouter/retirer un admin ne touche plus au code ni aux
  variables d'environnement du Worker).
- **Contrainte** : nécessite que le domaine protégé soit dans la zone
  Cloudflare de l'équipe (voir dépendance ci-dessus).

### Option B — Auth.js / NextAuth

**Principe** : bibliothèque d'authentification intégrée à Next.js, avec
fournisseurs OAuth (Google, GitHub…) ou e-mail magic link.

- **Coût** : gratuit (bibliothèque open source).
- **Effort** : moyen-élevé. Nécessite un adaptateur de session (cookie JWT
  ou base de données), la configuration d'au moins un fournisseur OAuth
  externe, et une vérification de compatibilité avec le runtime Edge de
  Workers (Auth.js fonctionne sur Cloudflare Workers, mais certains
  adaptateurs/fournisseurs demandent une attention particulière à la
  compatibilité `nodejs_compat`).
- **Compatibilité D1/Workers** : bonne, avec un adaptateur D1 pour les
  sessions si on ne veut pas de sessions JWT pures — complexité
  supplémentaire non nécessaire ici (peu d'admins).
- **Maintenance** : moyenne — une dépendance de plus à suivre dans son
  cycle de versions, une UI de connexion à maintenir.

### Option C — Clerk / Supabase Auth / autre fournisseur tiers

**Principe** : service SaaS dédié à l'authentification, UI de connexion
prête à l'emploi, gestion des utilisateurs déportée chez le fournisseur.

- **Coût** : gratuit pour un petit nombre d'utilisateurs chez la plupart
  des fournisseurs, mais avec un risque de passage à un palier payant si la
  structure grandit (dépend du fournisseur).
- **Effort** : faible à l'intégration, mais ajoute un **nouveau vendeur
  externe** à la chaîne de confiance du projet, en plus de Cloudflare et de
  la plateforme d'hébergement.
- **Compatibilité D1/Workers** : bonne en général (SDK compatibles edge),
  mais introduit une dépendance réseau supplémentaire sur le chemin
  critique de connexion admin.
- **Maintenance** : faible côté code, mais dépendance à la disponibilité et
  à la politique tarifaire d'un tiers non-Cloudflare — moins aligné avec la
  volonté de rester sur une stack Cloudflare unifiée (D1/R2/Workers).

### Option D — Authentification custom minimale

**Principe** : construire soi-même un flux de connexion (mot de passe ou
lien magique par e-mail), stocké dans D1.

- **Coût** : nul en licence, mais coût caché le plus élevé du tableau.
- **Effort** : élevé — il faut construire et maintenir : hachage de mot de
  passe (ou envoi d'e-mails avec un vrai service d'envoi, lui-même une
  nouvelle dépendance externe), gestion de session, protection contre le
  bruteforce, réinitialisation de mot de passe, et toute la surface de
  sécurité que cela ouvre.
- **Compatibilité D1/Workers** : totale (D1 comme store de session), mais
  c'est précisément le type de solution que `AUTH_TRUST_MODEL.md`
  déconseille explicitement (« ne pas inventer de crypto maison »).
- **Maintenance** : élevée, avec un risque de sécurité qui grandit avec le
  temps si elle n'est pas suivie activement.

## Recommandation : Option A — Cloudflare Access

C'est la seule option qui coche simultanément les cinq critères demandés :
simple (pas de code de connexion à écrire), robuste (JWT signé,
vérifiable), peu coûteuse (gratuite pour ce volume d'admins), adaptée à un
petit nombre d'administrateurs (gestion par liste d'e-mails dans un
dashboard), et facile à maintenir (zéro dépendance applicative nouvelle
côté auth, à part une bibliothèque de vérification JWT légère et optionnelle
pour la défense en profondeur). Elle reste en plus sur la même plateforme
que D1/R2/Workers, ce qui correspond à la volonté explicite de ne pas
multiplier les fournisseurs.

## Plan de migration progressif

**Phase 0 (faite lors de l'audit de portabilité)** : documentation
uniquement, aucun changement de code ni de configuration.

**Phase 1 — Module et cohabitation (fait), validation réelle (à faire par
vous)** (précondition : un Worker staging déployé sur un domaine propre à
l'équipe, voir `DEPLOYMENT_OUTSIDE_SITES.md`) :
1. ~~Activer Cloudflare Zero Trust sur le compte (gratuit).~~ → à faire par
   vous, voir `CLOUDFLARE_ACCESS_SETUP.md` (nécessite votre compte Cloudflare).
2. ~~Créer une politique Access protégeant `/admin*` et `/api/admin/*`~~ → à
   faire par vous, procédure détaillée dans `CLOUDFLARE_ACCESS_SETUP.md`.
3. **Fait** : `lib/auth/cloudflare-access.ts` vérifie le JWT
   `Cf-Access-Jwt-Assertion` contre les clés publiques de l'équipe (JWKS
   distant, mis en cache par isolat), avec vérification de signature,
   émetteur, audience et expiration — pas seulement de présence de l'en-tête.
4. **Fait** : `lib/admin-auth.ts` (`getCurrentUser()`) fait cohabiter les
   deux méthodes — SIWC essayé en premier (comportement inchangé), puis
   Cloudflare Access uniquement si `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`
   sont configurées. Aucune fusion de logique : c'est un **OU** strict entre
   deux vérifications indépendantes (voir le risque correspondant plus bas).
   Vérifié par exécution réelle (pas seulement lu) : sur un serveur de
   développement local avec les deux en-têtes testés séparément, SIWC reste
   fonctionnel à l'identique, et un jeton Access invalide/expiré/mal signé
   échoue proprement (401), sans jamais faire planter la requête — voir
   `STAGING_TEST_REPORT.md`.
5. **À faire par vous** : avec une vraie équipe Cloudflare Access
   configurée (étapes 1-2), tester le parcours complet (connexion, CMS,
   éditeur visuel, publication) sur staging avec Access actif — c'est le
   seul morceau qui ne pouvait pas être vérifié sans votre compte Cloudflare.

**Phase 2 — Bascule production** (seulement après validation complète de la
Phase 1, et seulement quand la production elle-même sera hors Sites ou que
Sites autorise un domaine personnalisé avec Access devant) :
1. Répéter la configuration Access sur le domaine de production.
2. Garder la cohabitation SIWC + Access active un temps de transition
   raisonnable (ex. 2 semaines), en surveillant les journaux
   `[admin-auth]` (déjà en place depuis la Phase 1 du projet) pour confirmer
   qu'aucune connexion ne passe plus par SIWC.
3. Retirer le chemin SIWC (`app/chatgpt-auth.ts`, ou son usage dans
   `lib/admin-auth.ts`) uniquement à ce moment-là, dans un correctif dédié
   et testé séparément — pas dans cette phase.

## Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| Le domaine reste sur `*.chatgpt.site` (hors zone Cloudflare de l'équipe), rendant Access inutilisable | **Bloquant** pour la Phase 2 tant que non résolu | Séquencer explicitement après la migration de domaine (voir `ENVIRONMENTS.md`/§16) ; rester sur SIWC en attendant, sans risque puisqu'inchangé |
| Mauvaise configuration de la politique Access (liste d'e-mails incomplète) coupant l'accès à un admin légitime | Moyen | Tester d'abord sur staging avec tous les admins réels ; garder un accès de secours (ex. accès direct au dashboard Cloudflare pour modifier la politique) pendant la transition |
| JWT Access mal vérifié côté Worker (bug d'implémentation) créant une fausse impression de sécurité | Élevé si non testé | Tests automatisés dédiés (JWT valide/invalide/expiré/mauvaise signature) avant toute bascule production, sur le modèle de `tests/auth-allowlist.test.ts` |
| Cohabitation SIWC + Access mal implémentée, ouvrant un accès qu'aucune des deux méthodes seules n'autoriserait | Élevé | La cohabitation doit être un **OU** strict entre deux vérifications indépendantes, jamais une fusion de logique — revue de code dédiée avant activation |
| Coût si le nombre d'admins dépasse 50 (palier gratuit Cloudflare Access) | Faible aujourd'hui | Improbable pour une structure de cette taille ; à réévaluer si la situation change |

## Effort estimé

- Phase 1 (module de vérification + cohabitation + tests) : quelques jours
  de développement, correctif de taille comparable à un correctif de
  Phase 1 du projet (voir `CHANGELOG_PHASE1.md` pour l'ordre de grandeur).
- Phase 2 (bascule + retrait SIWC) : effort plus faible, majoritairement de
  la configuration et de la surveillance, une fois la Phase 1 validée.

## Rollback

- **Phase 1** : désactiver la politique Access dans le dashboard Cloudflare
  — SIWC continue de fonctionner sans interruption puisqu'il n'a jamais été
  retiré. Aucune action côté code nécessaire pour revenir en arrière.
- **Phase 2** : si un problème apparaît après le retrait de SIWC, restaurer
  le commit précédent (celui qui gardait encore la cohabitation) — voir
  `ROLLBACK_EXTERNAL_HOSTING.md` pour la procédure générale de rollback de
  déploiement. C'est pourquoi la Phase 2 ne doit retirer SIWC que dans un
  commit dédié, distinct de l'activation d'Access elle-même.

## Compatibilité D1/Workers

Aucun impact sur le schéma D1 existant. `admin_users` (table aujourd'hui
inutilisée, voir `AUDIT_DIVINE_MOTION.md`) pourrait éventuellement servir de
miroir de la politique Access pour affichage dans le CMS, mais ce n'est pas
nécessaire à la migration elle-même — Access reste la source de vérité des
accès, pas D1. Aucun changement de binding requis (`DB`/`BUCKET` inchangés).
