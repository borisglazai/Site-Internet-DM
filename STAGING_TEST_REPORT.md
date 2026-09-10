# Rapport de tests — Staging hors ChatGPT Sites

Cette session n'a **aucun accès à un compte Cloudflare réel** (pas de
`CLOUDFLARE_API_TOKEN`). Deux catégories de vérification en résultent :

- **Section A** : tout ce qui a pu être vérifié réellement dans ce bac à
  sable — build, tests automatisés (y compris cryptographie JWT réelle),
  serveur de développement local avec D1/R2 simulés, avant/après sur du vrai
  trafic HTTP. Rien ici n'est une simple lecture de code.
- **Section B** : la checklist des sections 10 à 16 de la demande, qui
  nécessite une vraie URL staging déployée — à exécuter par vous en suivant
  `STAGING_SETUP.md`, avec ce document comme grille à remplir.

## A. Vérifications réellement effectuées dans cette session

### A.1 Tests automatisés

```
node --test tests/*.test.ts
```

**41/41 tests verts**, dont 9 nouveaux pour `lib/auth/cloudflare-access.ts`
(`tests/cloudflare-access.test.ts`) qui exercent une **vraie vérification
cryptographique** — une paire de clés RSA générée à la volée, un JWT signé
avec `jose`, vérifié par le code exact qui tournera en production (pas un
mock) :

| Cas | Résultat |
|---|---|
| JWT valide, signature correcte | Accepté, e-mail extrait |
| Aucun en-tête | `null` (pas une erreur) |
| Mauvaise signature (autre paire de clés) | Rejeté |
| Mauvaise audience (AUD) | Rejeté |
| Mauvais émetteur (équipe) | Rejeté |
| Jeton expiré | Rejeté |
| JWT valide sans revendication `email` | Rejeté |
| Jeton malformé | Rejeté sans exception |
| Format de clé (JWK RSA réel) | Conforme |

### A.2 Build et vérifications statiques

- `npm run build` : succès, bundle Worker 875 Kio, généré sans accès à
  ChatGPT Sites.
- `npx tsc --noEmit` : 14 erreurs — **identique à la référence connue**
  (`scripts/typescript-baseline-count.txt`), aucune nouvelle erreur
  introduite par les fichiers d'authentification.
- `npm run lint:targeted` : 43 erreurs / 9 avertissements sur 22 fichiers —
  référence mise à jour une fois (voir `scripts/eslint-baseline-count.json`)
  pour inclure `app/admin/page.tsx`, nouvellement ciblé ; ses 2 erreurs
  préexistantes (`<a>` au lieu de `<Link>`, sans rapport avec cette phase)
  sont les seules comptées en plus. **Les trois nouveaux fichiers
  d'authentification (`lib/auth/cloudflare-access.ts`, `lib/admin-auth.ts`,
  `tests/cloudflare-access.test.ts`) sont à zéro erreur et zéro
  avertissement.**
- `wrangler deploy --config dist/server/wrangler.deploy.json --dry-run`
  avec `CF_ROUTE_PATTERN=staging.divinemotion.ca` et
  `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` renseignées : validé avec succès,
  bindings D1/R2/variables tous reconnus par Wrangler.

### A.3 Bug trouvé et corrigé pendant cette phase

**`app/admin/page.tsx`** vérifiait la présence d'un utilisateur via
`getChatGPTUser()` (spécifique SIWC) plutôt que via la nouvelle abstraction
`getCurrentUser()`. Sur un Worker protégé uniquement par Cloudflare Access
(pas de SIWC du tout), un administrateur pourtant valide via Access aurait
toujours vu l'écran « Se connecter avec ChatGPT » au lieu du CMS — un vrai
défaut d'intégration, trouvé par relecture avant tout déploiement, corrigé
en 3 lignes (voir `git log` sur ce fichier). Confirmé par test réel
ci-dessous (A.4).

**`middleware.ts` (nouveau fichier)** — en préparant la checklist B.16 ci-dessous,
vérification empirique (pas une simple lecture de code) que les réponses
`/admin` et `/api/admin/*` ne portaient **aucun** en-tête `Cache-Control` :

```
curl -s -D - -o /dev/null -H "oai-authenticated-user-email: admin@example.com" \
  "http://localhost:<port>/api/admin/cms?resource=dashboard"
```

→ aucun `Cache-Control` dans la réponse, alors que la demande exige
explicitement de vérifier « qu'une réponse admin n'est jamais mise en cache
et servie à un visiteur public ». Confirmé que vinext supporte le
`middleware.ts` standard de Next.js (présence de `app-middleware.js`,
`middleware-runtime.js`, `middleware-matcher.js`,
`mergeMiddlewareResponseHeaders` dans `node_modules/vinext/dist/server/`).
Corrigé avec un middleware minimal, scopé uniquement à `/admin`,
`/admin/:path*` et `/api/admin/:path*` :

```ts
export function middleware() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"] };
```

Revérifié en direct après correctif (serveur de développement relancé) :

| Requête | Avant | Après |
|---|---|---|
| `GET /api/admin/cms?resource=dashboard` (en-tête admin valide) | `200`, aucun `Cache-Control` | `200`, `cache-control: private, no-store` |
| `GET /api/admin/cms?resource=dashboard` (sans en-tête) | `401`, aucun `Cache-Control` | `401`, `cache-control: private, no-store` |
| `GET /admin` (sans en-tête) | `200` HTML, aucun `Cache-Control` | `200` HTML, `cache-control: private, no-store` |
| `GET /` (page publique) | `200`, `cache-control: no-store, must-revalidate` (défaut vinext) | Inchangé — le middleware ne s'applique pas à cette route (`matcher` scopé), aucune régression sur le site public |

→ Le quatrième cas confirme que le correctif ne touche que les routes admin :
le comportement de cache du site public n'a pas changé. Fichier ajouté à
`scripts/lint-targeted-files.txt` (0 erreur/0 avertissement ESLint, aucune
nouvelle erreur `tsc`, build et 41/41 tests toujours verts après ajout — voir
A.1/A.2).

**Limite connue, non corrigée (mineure)** : le lien de déconnexion
(`chatGPTSignOutPath`) reste spécifique à SIWC. Sur un environnement
protégé uniquement par Cloudflare Access, ce lien pointerait vers une route
qui n'existe pas hors Sites. Se déconnecter sur staging (Access seul)
passera par la déconnexion Cloudflare Access elle-même (dashboard ou
`https://<team-domain>/cdn-cgi/access/logout`), pas par ce lien applicatif.
Non corrigé ici pour rester dans le périmètre strict de cette phase (pas de
refonte d'UX) — à traiter si Access devient le mécanisme principal.

### A.4 Vérification runtime réelle (serveur de développement local, D1/R2 Miniflare)

Migrations appliquées à une base D1 locale fraîche, puis :

**Chemin SIWC (comportement Sites actuel — régression testée)**
| Test | Résultat |
|---|---|
| `GET /api/admin/cms?resource=dashboard` sans en-tête | `401` |
| Idem avec `oai-authenticated-user-email: admin@example.com` (autorisé) | `200` |
| Idem avec un e-mail non autorisé | `401` |
| `GET /admin` avec en-tête admin valide | Affiche le CMS (`Administration`), pas l'écran de connexion |

→ **Aucune régression** : comportement strictement identique à avant cette
phase.

**Chemin Cloudflare Access (nouveau, `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` configurées)**
| Test | Résultat |
|---|---|
| Aucun en-tête d'identité | `401` |
| En-tête `cf-access-jwt-assertion` avec une valeur non-JWT | `401`, log `[cloudflare-access] JWT rejeté { reason: 'Invalid Compact JWS' }` — pas de 500 |
| En-tête avec un JWT de forme valide mais domaine JWKS injoignable/invalide | `401`, log `[cloudflare-access] JWT rejeté { reason: 'Expected 200 OK from the JSON Web Key Set HTTP response' }` — pas de 500 |
| SIWC toujours actif en parallèle | `200` avec l'en-tête SIWC valide, sans interférence |

→ **Cohabitation confirmée** : les deux chemins coexistent sans se
marcher dessus, et toute défaillance du chemin Access (réseau, jeton
invalide) échoue proprement plutôt que de planter la requête.

**Ce qui n'a pu être testé qu'en partie** : la vérification ci-dessus
prouve la robustesse du code face à un JWT invalide/injoignable, mais pas
le chemin de **succès** contre une vraie équipe Cloudflare Access (cela
demanderait un vrai domaine d'équipe joignable en HTTPS, donc un compte
Cloudflare réel). Le chemin de succès cryptographique complet, lui, **est**
vérifié — voir A.1 — avec une clé injectée localement plutôt que récupérée
par le réseau. La seule brique non vérifiée ici est purement réseau (« est-ce
que `fetch()` vers un vrai `*.cloudflareaccess.com` retourne bien un JWKS
valide »), pas la logique de vérification elle-même.

## B. Checklist à exécuter contre une vraie URL staging (sections 10-16)

À remplir une fois `STAGING_SETUP.md` suivi jusqu'au bout. Cocher chaque
case et noter tout écart.

### 10. Site public

- [ ] Accueil — identique visuellement à la production
- [ ] Notre travail — identique
- [ ] Services — identique
- [ ] À propos — identique
- [ ] Contact — identique
- [ ] Pages projets — identique
- [ ] Toute différence visuelle notée ici est une régression à corriger avant validation

### 11. Admin

- [ ] Accès autorisé (compte listé dans Access ET `ADMIN_EMAILS`)
- [ ] Accès refusé (compte non listé)
- [ ] Dashboard
- [ ] Projets
- [ ] Médias
- [ ] Services
- [ ] Équipe
- [ ] Demandes
- [ ] SEO
- [ ] Paramètres

### 12. Éditeur visuel

- [ ] Activation
- [ ] Persistance du mode édition entre pages
- [ ] Modification texte
- [ ] Modification image
- [ ] Galerie
- [ ] Brouillon
- [ ] Prévisualisation
- [ ] Publication
- [ ] Dépublication

### 13. Médias réels (navigateur réel)

- [ ] JPEG léger
- [ ] PNG
- [ ] Image haute résolution (~24 Mpx)
- [ ] Upload multiple
- [ ] États upload : Téléversement → Traitement → Enregistrement → Terminé (voir Phase 1, `app/admin/media-library.tsx`)
- [ ] Apparition médiathèque
- [ ] Persistance après reload
- [ ] Persistance après reconnexion
- [ ] Utilisation dans un projet
- [ ] Remplacement
- [ ] Suppression
- [ ] `abort-upload` (interrompre volontairement une séquence multi-parties)
- [ ] Objet présent dans R2 (`wrangler r2 object list divine-motion-staging-media`)
- [ ] Entrée présente dans D1 (`wrangler d1 execute divine-motion-staging --remote --command="SELECT id,name FROM media ORDER BY id DESC LIMIT 5;"`)

### 14. CMS

- [ ] Création projet brouillon (préfixé `TEST —`)
- [ ] Service test
- [ ] Membre équipe test
- [ ] Projet avec galerie
- [ ] Save / Preview / Publish / Unpublish
- [ ] Reload après publication
- [ ] Logout/login

### 15. Formulaire public

- [ ] Demande envoyée depuis le formulaire staging
- [ ] Visible dans Admin > Demandes, statut « Nouveau »
- [ ] Changement de statut
- [ ] Note interne ajoutée et relue

### 16. Sécurité

- [ ] `/admin` sans authentification → refus (Access, avant même le Worker)
- [ ] `/api/admin/*` sans authentification → `401`
- [ ] Utilisateur authentifié (Access) mais non listé dans `ADMIN_EMAILS` → refus applicatif
- [ ] Utilisateur autorisé → accès complet
- [ ] Falsification manuelle de `cf-access-jwt-assertion` (valeur arbitraire) → refus (vérifié en local, à reconfirmer en staging réel)
- [ ] Falsification de `oai-authenticated-user-email` directement contre l'URL staging (sans passer par Access) → doit échouer si Access protège bien `/admin*`/`/api/admin/*` au niveau edge ; sinon, le Worker doit quand même refuser si l'e-mail n'est pas autorisé — les deux comportements sont acceptables, un accès complet sans aucun contrôle ne l'est pas
- [ ] Accès direct au Worker (`*.workers.dev`) s'il existe en parallèle du domaine personnalisé — vérifier que la protection Access s'applique aussi là, ou restreindre l'accès à ce domaine si Access ne peut pas le couvrir
- [ ] Aucun secret dans les réponses HTTP ni les logs (`wrangler tail`)
- [ ] Une réponse admin n'est jamais mise en cache et servie à un visiteur public — **corrigé et vérifié en local** (voir A.3 : `middleware.ts` fixe `Cache-Control: private, no-store` sur `/admin*` et `/api/admin/*`, sans effet sur le site public). Reste à confirmer en staging réel : qu'aucune règle de cache Cloudflare (Cache Rules / Page Rules) au niveau de l'edge ne réintroduise un cache sur ces chemins malgré cet en-tête applicatif

## Bugs rencontrés

1. `app/admin/page.tsx` — voir A.3, corrigé.
2. Aucun autre bug trouvé dans le code d'authentification pendant cette
   session (revue complète + tests + exécution réelle du chemin SIWC et du
   chemin d'échec Access).

## Ce que cette session n'a pas pu tester (et pourquoi)

- Déploiement réel sur Cloudflare Workers (pas d'identifiants).
- Chemin de succès Cloudflare Access de bout en bout (nécessite une vraie
  équipe Zero Trust joignable en HTTPS).
- Upload d'une vraie photo haute résolution depuis un navigateur (pas de
  navigateur piloté disponible dans ce bac à sable pour ce test précis).
- Tests de charge / performance réseau réels.

Ces points sont couverts par la checklist B, à exécuter par vous une fois
staging déployé.
