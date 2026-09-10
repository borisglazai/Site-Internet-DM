# Configuration Cloudflare Access — Divine Motion staging

Playbook à exécuter **vous-même**, avec votre compte Cloudflare (cette
session n'y a pas accès). Objectif : protéger `/admin*` et `/api/admin/*`
sur le Worker staging par Cloudflare Access, en plus de la vérification JWT
déjà écrite côté code (`lib/auth/cloudflare-access.ts`). SIWC n'est touché
en rien — voir `AUTH_MIGRATION_PLAN.md`.

**Pourquoi les deux (Access au bord + vérification JWT dans le Worker)** :
Access bloque une requête non authentifiée avant qu'elle n'atteigne le
Worker (protection au niveau de l'edge). Le Worker vérifie *quand même* le
JWT lui-même, pour ne jamais dépendre uniquement d'un en-tête déclaratif —
exactement la consigne « ne pas se contenter de faire confiance à
`Cf-Access-Authenticated-User-Email` sans validation si une validation JWT
est possible ».

## 1. Activer Cloudflare Zero Trust

1. Dashboard Cloudflare → **Zero Trust** (menu de gauche).
2. Si ce n'est pas déjà fait, choisir un nom d'équipe — cela fixe votre
   **Team Domain** : `<nom-équipe>.cloudflareaccess.com`. Notez-le, il sert
   de valeur à `CF_ACCESS_TEAM_DOMAIN`.
3. Le plan gratuit couvre jusqu'à 50 utilisateurs — largement suffisant
   (voir `AUTH_MIGRATION_PLAN.md`, comparatif des options).

## 2. Créer l'application Access

1. Zero Trust → **Access** → **Applications** → **Add an application** →
   **Self-hosted**.
2. **Application domain** : le sous-domaine staging (ex.
   `staging.divinemotion.ca`), avec le chemin `/admin` pour ne protéger que
   l'espace admin. Ajouter une **seconde règle de chemin** pour
   `/api/admin/*` dans la même application (Access permet plusieurs chemins
   par application) — les deux doivent être protégés, comme demandé.
   Le reste du site (accueil, projets, formulaire public) ne doit **pas**
   être derrière Access : le site public doit rester accessible sans
   connexion.
3. Une fois créée, ouvrir l'application et noter son **Application Audience
   (AUD) Tag** (visible dans l'onglet Overview) — c'est la valeur de
   `CF_ACCESS_AUD`.

## 3. Politique d'accès (allowlist)

1. Dans l'application, onglet **Policies** → **Add a policy**.
2. **Action** : Allow.
3. **Include** → règle **Emails** → lister exactement les adresses des
   administrateurs actuels (les mêmes que `ADMIN_EMAILS` aujourd'hui, pour
   ne pas introduire d'écart pendant la transition).
4. Méthode de connexion recommandée pour un petit nombre d'admins : **One-time PIN**
   (e-mail à usage unique, aucune inscription à un fournisseur SSO
   nécessaire). Google/GitHub SSO restent des options si l'équipe les
   utilise déjà.
5. Enregistrer.

**Double contrôle volontaire** : la politique Access (étape 3) et
l'allowlist `ADMIN_EMAILS` du Worker (`lib/auth-allowlist.ts`) sont deux
listes séparées, vérifiées indépendamment (Access au bord, puis
`isEmailAllowed()` dans le Worker après vérification du JWT). Un compte doit
figurer dans **les deux** pour accéder au CMS. Tenez-les synchronisées pour
éviter des refus surprenants, mais ne fusionnez jamais les deux mécanismes.

## 4. Configurer le Worker (variables, pas des secrets)

`CF_ACCESS_TEAM_DOMAIN` et `CF_ACCESS_AUD` ne sont pas des secrets — ce sont
des identifiants publics de configuration, pas des clés. Sur GitHub
(Environment `staging`, voir `DEPLOYMENT_OUTSIDE_SITES.md`), les ajouter
comme **variables** (pas secrets) :

```
CF_ACCESS_TEAM_DOMAIN = <nom-équipe>.cloudflareaccess.com
CF_ACCESS_AUD          = <AUD Tag de l'application>
```

`scripts/deploy-config.mjs` les injecte automatiquement dans la
configuration Wrangler générée (`vars`) si elles sont présentes — voir ce
script pour le détail. Redéployer (voir `DEPLOYMENT_OUTSIDE_SITES.md`) pour
que le Worker les reçoive.

## 5. Validation en conditions réelles (à faire par vous)

1. Ouvrir `https://staging.<votre-domaine>/admin` dans un navigateur **en
   navigation privée** (pour éviter une session Access déjà active). Vous
   devez être redirigé vers l'écran de connexion Cloudflare Access (One-time
   PIN), pas vers l'écran « Se connecter avec ChatGPT ».
2. Se connecter avec un e-mail listé dans la politique Access. Vous devez
   arriver sur le CMS (`AdminApp`), pas sur l'écran « Accès refusé » — sauf
   si cet e-mail n'est pas aussi dans `ADMIN_EMAILS` (double contrôle,
   voir §3).
3. Vérifier les journaux du Worker (`wrangler tail`, voir
   `DEPLOYMENT_OUTSIDE_SITES.md`) : aucune ligne `[cloudflare-access] JWT
   rejeté` ne doit apparaître pour une session valide.
4. Tester un e-mail **non listé** dans la politique Access : Access lui-même
   doit bloquer avant le Worker (page de refus Cloudflare, pas l'écran
   applicatif).
5. Tester un e-mail listé dans Access mais **pas** dans `ADMIN_EMAILS` (si
   vous en avez un de test) : doit atteindre l'écran applicatif « Ce compte
   n'est pas autorisé » — confirme que le double contrôle fonctionne
   indépendamment.
6. Renseigner les résultats dans `STAGING_TEST_REPORT.md`.

## Rollback

Désactiver ou supprimer l'application Access dans le dashboard (Zero Trust
→ Access → Applications). Le Worker continue de fonctionner : sans Access
devant, les requêtes arrivent directement, et `getCurrentUser()` retombe sur
son comportement actuel — accès refusé pour quiconque n'a pas d'en-tête
SIWC valide (ce qui, hors Sites, est tout le monde ; c'est pourquoi Access
doit être configuré pour que `/admin` soit utilisable sur staging tant que
SIWC n'y est pas disponible). Aucune action côté code n'est nécessaire :
retirer `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` des variables GitHub
Environment puis redéployer suffit à désactiver complètement ce chemin.

## Ce que ce document ne couvre pas

- La bascule de la production (voir `AUTH_MIGRATION_PLAN.md`, Phase 2 — pas
  cette phase).
- Le retrait de SIWC (jamais fait tant que Access n'est pas validé et
  qu'une décision explicite n'a pas été prise).
- La création du domaine/sous-domaine lui-même (voir
  `DEPLOYMENT_OUTSIDE_SITES.md`, section Domaines).
