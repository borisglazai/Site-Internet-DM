# Divine Motion — dossier d’audit technique

## Objet et périmètre

Ce paquet est une photographie du code source de la version 14 du site Divine Motion, issue du commit `8a7c720e7db90478e120a9ecad93225648487207`. Il est destiné à un audit externe et ne contient ni export de la base de production, ni objets R2, ni secrets, ni cookies. Les trois images de marque présentes dans `public/assets/` sont des ressources publiques du site.

Divine Motion est un site portfolio et de prise de contact pour une structure de photographie et vidéographie. Le site public présente l’accueil, le portfolio, les services, l’équipe, les pages projets et le formulaire de demande. Le CMS sous `/admin` gère les contenus structurés, médias, projets, services, équipe, demandes, SEO et corbeille. L’éditeur visuel superpose des contrôles au site public afin d’éditer les données CMS dans leur contexte.

## Architecture

- Framework : Next.js App Router 16.2.6, React 19.2.6, TypeScript 5.9.3.
- Adaptation d’exécution : Vinext/Vite, cible Cloudflare Worker.
- Backend : Route Handlers Next.js exécutés dans le Worker.
- Données : Cloudflare D1, accès direct par requêtes préparées ; Drizzle sert à déclarer et migrer le schéma.
- Fichiers : Cloudflare R2 via le binding `BUCKET`.
- Authentification : identité ChatGPT transmise par en-têtes fiables de la plateforme, puis liste d’autorisation `ADMIN_EMAILS`.
- État d’édition : cookie HTTP-only `dm_visual_editor`, valable 8 heures, lié à une identité admin valide.
- État applicatif client : composants React locaux ; le CMS recharge les ressources depuis les API. L’éditeur visuel conserve une copie de contenu, un historique annuler/rétablir et autosauvegarde le brouillon après 1,4 seconde d’inactivité.

Le rendu public lit uniquement les enregistrements publiés/visibles et les paramètres publiés. L’éditeur demande explicitement le brouillon. Il n’existe pas de seconde base : CMS et éditeur lisent et écrivent D1.

## Données et persistance

Le schéma canonique est `db/schema.ts`. Les migrations SQL sont dans `drizzle/`. Le binding D1 logique est `DB`, déclaré dans `.openai/hosting.json`. Les tables sont : `cms_settings`, `projects`, `project_sections`, `media`, `services`, `team_members`, `inquiries`, `admin_users`, `inquiry_notes`, `audit_log`.

Plusieurs collections sont sérialisées en JSON (`gallery_json`, `videos_json`, `tags_json`, `media_json`, `extra_json` et `cms_settings.value`). Les relations sont logiques : le schéma SQL actuel ne déclare pas de clés étrangères. Voir `DATA_MODEL.md` pour les colonnes et relations.

Le contenu de production n’est volontairement pas présent dans ce paquet. Pour un audit de données, produire séparément un export anonymisé et chiffré, avec autorisation explicite.

## Médias et R2

`POST /api/admin/media` reçoit soit une vidéo externe HTTPS en JSON, soit des fichiers multipart. Pour les images, le navigateur fabrique quatre variantes WebP (thumbnail, mobile, desktop, original), chacune inférieure à 640 Kio, puis les envoie séquentiellement. Le serveur limite chaque partie à 700 Kio, stocke dans R2 et finalise les métadonnées dans D1. En cas d’échec avant finalisation, les objets connus sont supprimés. Lors d’un remplacement réussi, les anciens objets sont supprimés après mise à jour D1.

`GET /api/media/[id]` résout la variante demandée, lit R2 et retourne une réponse cacheable immuable. Les vidéos externes redirigent vers leur URL. La suppression courante est logique (`deleted_at`) ; la suppression définitive, depuis la corbeille, efface les clés R2 après vérification que l’élément est déjà dans la corbeille.

## Authentification, autorisations et rôles

`app/chatgpt-auth.ts` lit les en-têtes `oai-authenticated-user-*` injectés par l’hébergement. `lib/admin-auth.ts` compare ensuite l’adresse à `ADMIN_EMAILS`. Toutes les API `/api/admin/*` appellent `requireAdminApi()`. La page `/admin` affiche connexion, refus ou CMS selon l’état.

La table `admin_users` et sa colonne `role` existent, mais le contrôle d’accès actuel ne les consulte pas : il n’existe donc qu’un niveau fonctionnel d’administration, basé sur `ADMIN_EMAILS`. C’est un point d’audit important si des rôles fins sont attendus.

## Brouillon, prévisualisation et publication

Les brouillons visuels sont stockés dans `cms_settings` sous `visual_draft_<pageKey>`. Le public continue de lire les clés publiées (`home`, `work`, `services_page`, `about`, `contact`, `general`). La prévisualisation requiert à la fois une session éditeur active et `?preview=1`. Publier copie le contenu vers la clé publique ou les tables de projet, supprime le brouillon, puis écrit dans `audit_log`. Restaurer utilise le dernier snapshot de publication disponible.

Dans le CMS classique, un projet a `draft`, `published` ou `archived`. La publication visuelle d’un projet force `published` sauf si le contenu demandé est `archived`. Il n’existe pas d’endpoint distinct appelé « unpublish » : le CMS repasse le projet en `draft`.

## Éditeur visuel

Les pages publiques marquent les cibles avec `data-edit-key`, `data-media-key`, `data-gallery-key`, `data-link-*` et `data-section-key`. `app/visual-editor.tsx` intercepte clics et saisie pour proposer : édition inline, sélection média, alt, galeries, réordonnancement, visibilité, blocs personnalisés, undo/redo, autosauvegarde, preview et publication. Le panneau est latéral sur bureau et stylé par `app/visual-editor.css` pour le mobile.

Le mode global dépend du cookie sécurisé `dm_visual_editor`; le paramètre `?edit=1` subsiste comme mécanisme de compatibilité sur l’accueil et les projets. `PageShell` doit conserver les navigations normales ; chaque page publique recharge ensuite l’état de session.

Éléments couverts actuellement : accueil, Notre travail, Services, À propos, Contact et projet. L’éditabilité réelle dépend de la présence des attributs `data-*` dans le rendu.

## Build, test et déploiement

Prérequis : Node.js `>=22.13.0`, npm, environnement compatible Cloudflare Workers. Installer avec `npm ci` ou `npm run install:ci`. Lancer en développement avec `npm run dev`. Construire avec `npm run build`. Tester avec `npm test`. Lint : `npm run lint`. Générer une migration après modification du schéma : `npm run db:generate`.

La configuration logique d’hébergement déclare D1 `DB` et R2 `BUCKET`. La plateforme injecte les ressources réelles. `worker/index.ts` expose le handler Vinext et l’optimisation d’images. Ne pas exécuter les migrations de production sans sauvegarde, revue SQL et plan de retour arrière.

## Limites et problèmes connus à auditer

1. **Uploads historiquement bloqués à 100 %** : l’environnement rejette les multipart proches de 1 Mio. Le contournement actuel fragmente les variantes à 640 Kio. Les grandes vidéos directes restent volontairement refusées ; YouTube/Vimeo est recommandé. À tester sur Safari iOS, Chrome mobile et connexions lentes.
2. **Optimisation GIF** : `createImageBitmap` puis conversion WebP produit des images fixes ; l’animation GIF n’est pas explicitement préservée.
3. **Éditeur historiquement instable entre pages** : le cookie global corrige la perte du mode ; vérifier toutes les routes, les liens internes et les expirations de session.
4. **Couverture éditable incomplète possible** : seuls les nœuds marqués par les attributs `data-*` sont interactifs. Certains textes calculés (dates, libellés techniques, contenu des cartes projets) peuvent rester indirects ou CMS-only.
5. **Écarts schéma/code** : `publishVisualSettingsPage()` tente d’écrire `updated_by` dans `services` et `team_members`, mais ces colonnes ne figurent ni dans `db/schema.ts` ni dans les migrations incluses. Une publication visuelle contenant ces lignes peut échouer sur D1.
6. **Rôles non appliqués** : `admin_users` existe mais l’autorisation utilise uniquement `ADMIN_EMAILS`.
7. **Relations sans contraintes FK** : les références média/projet peuvent devenir orphelines. La détection d’usage média repose en partie sur `LIKE` dans du JSON et peut produire faux positifs/faux négatifs.
8. **Suppression média forcée** : elle peut laisser des références cassées dans les contenus ; aucun nettoyage transactionnel des références n’est effectué.
9. **Test automatisé limité** : un seul test vérifie le rendu HTML et la métadonnée de preview ; aucun test d’intégration D1/R2/auth/API ni E2E.
10. **Formulaire public** : honeypot présent, mais pas de rate limiting, CAPTCHA, validation de schéma centralisée ou notification courriel dans le code actuel.
11. **Restauration** : elle repose sur le dernier snapshot de publication, sans table de versions dédiée ; plusieurs chemins de restauration appellent à nouveau la publication et l’audit.
12. **Robustesse JSON** : des structures JSON permissives et typées `any` nécessitent des validations plus strictes. Un `null` dans une galerie a déjà provoqué une erreur serveur ; un garde ciblé a été ajouté sur l’accueil.

## Ordre de lecture recommandé

1. `README_AUDIT.md`
2. `PROJECT_MAP.md`
3. `DATA_MODEL.md`
4. `ROUTES_AND_API.md`
5. `DEPENDENCIES.md`
6. `AUDIT_TEST_CHECKLIST.md`
7. `db/schema.ts`, `drizzle/*.sql`, `lib/*`
8. `app/api/*`, puis `app/visual-editor.tsx` et `app/admin/*`

