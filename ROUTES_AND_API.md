# Routes et API

## Pages

| Route | Accès | Fonction et données |
|---|---|---|
| `/` | Public, toujours contenu publié | Accueil, paramètres `home/general`, projets publiés |
| `/notre-travail` | Public, toujours contenu publié | Portfolio, `work/general`, projets publiés |
| `/services` | Public, toujours contenu publié | `services_page`, table `services`, `general` |
| `/a-propos` | Public, toujours contenu publié | `about`, table `team_members`, `general` |
| `/contact` | Public, toujours contenu publié | `contact/general` et formulaire client |
| `/projets/[slug]` | Public, toujours contenu publié | Projet, chapitres, galerie, vidéos, SEO |
| `/admin` | Admin (SIWC ou Cloudflare Access selon l’environnement) | CMS complet ; sinon connexion/refus |
| `/admin/editor`, `/admin/editor/notre-travail`, `/admin/editor/services`, `/admin/editor/a-propos`, `/admin/editor/contact`, `/admin/editor/projets/[slug]` | Admin (même vérification que `/admin`, voir `lib/admin-auth.ts`) | Éditeur visuel — même composant de rendu que la page publique correspondante, avec brouillon `visual_draft_<pageKey>` et attributs d’édition (`data-edit-key`, etc.) actifs |
| `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback` | Plateforme | Routes réservées au flux d’identité SIWC, non implémentées dans le dépôt |

## API

| Méthode et route | Auth | Lecture/écriture |
|---|---|---|
| `POST /api/inquiries` | Public | Valide superficiellement et crée `inquiries`; honeypot `company` |
| `GET /api/content/settings` | Public | Lit `general` et `seo`; cache 60 s, stale 300 s |
| `GET /api/media/[id]?variant=...` | Public | Lit métadonnée D1 puis objet R2 ; redirection vidéo externe ; option `download=1` |
| `GET /api/admin/cms?resource=...` | Admin | Dashboard, settings, projects, inquiries, audit, trash, media, services, team |
| `POST /api/admin/cms` | Admin | Sauvegarde settings/projet/service/équipe/demande ; corbeille, restauration ou suppression définitive |
| `POST /api/admin/media` JSON | Admin | Crée une vidéo externe HTTPS dans `media` |
| `POST /api/admin/media` multipart | Admin | Stocke variantes R2, finalise ou remplace métadonnées D1 |
| `PATCH /api/admin/media` | Admin | Modifie métadonnées, catégorie, visibilité et rattachement projet |
| `DELETE /api/admin/media?id=&force=` | Admin | Détection d’usage puis suppression logique |
| `POST /api/admin/visual-editor` | Admin | Actions `save`, `discard`, `publish`, `restore` sur une page ou un projet |

Toutes les API admin nécessitent un utilisateur authentifié dont l’email figure dans `ADMIN_EMAILS`. Aucun rôle différencié n’est appliqué. Les entrées sont nettoyées par longueur et quelques listes fermées, mais il n’existe pas de schéma Zod global.

## Ressources de `/api/admin/cms`

- `dashboard` : compteurs, activité récente, stockage média.
- `settings` : toutes les clés CMS.
- `projects` : projets et sections avec JSON parsé.
- `inquiries` : demandes filtrables par statut/recherche.
- `audit` : 80 derniers événements.
- `trash` : éléments supprimés logiquement.
- `media` : médias, filtres et usages calculés.
- `services`, `team` : listes éditables.

## Matrice de mutation

- Settings : upsert `cms_settings`, audit.
- Projet : insert/update projet, remplacement des sections, unicité du projet vedette, audit.
- Service/équipe : insert/update, audit.
- Demande : statut, priorité, relance, traitement, archivage et note interne, audit.
- Corbeille : `deleted_at`, restauration, ou suppression physique ; pour média, suppression R2.
- Éditeur visuel : brouillon dans `cms_settings`, puis publication vers clé publique ou tables projet/services/équipe.

