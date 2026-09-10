# Audit complet — Divine Motion

**Périmètre analysé :** `divine-motion-audit-package` (commit source `8a7c720e7db90478e120a9ecad93225648487207`, v14), fourni sous forme de paquet d'audit statique (pas d'accès à la base D1 de production, ni aux objets R2, ni aux secrets).
**Méthode :** lecture intégrale du code (`app/`, `lib/`, `db/`, `drizzle/`, `worker/`, `build/`, `tests/`), croisement systématique schéma ⇄ requêtes ⇄ UI, vérification par recherche ciblée (grep) des patterns de sécurité, d'accessibilité et de SEO. Aucun fichier du projet n'a été modifié.
**Limites de cet audit :** pas d'exécution réelle (pas de build/D1/R2 disponibles dans cet environnement) ; les points mobiles/visuels non vérifiables par lecture statique sont signalés comme « à confirmer manuellement » plutôt qu'affirmés.

---

## A. Résumé exécutif

Le projet est **cohérent avec son ambition** : une seule source de vérité (Cloudflare D1), un CMS classique et un éditeur visuel qui lisent/écrivent exactement les mêmes tables, un principe « contenu flexible + design verrouillé » réellement appliqué dans le code (l'éditeur ne touche jamais au CSS ni à la structure des composants). Le bug historique de perte du mode édition semble correctement résolu par un cookie de session dédié. Le code ne contient aucune injection SQL détectée (requêtes 100 % paramétrées) et aucun `dangerouslySetInnerHTML`.

En contrepartie, le projet porte une dette réelle et plusieurs bugs vérifiables dans le code, pas seulement suspectés :

- une écriture SQL qui **va échouer** en production (colonnes inexistantes) lors de la publication visuelle de Services/À propos ;
- un **crash par pointeur nul** reproductible sur `/notre-travail` ;
- un pipeline d'upload média **structurellement fragile** (marge de 60 Ko entre le budget client et la limite serveur), qui explique vraisemblablement le blocage à 100 % déjà observé ;
- plusieurs champs du CMS (logos clair/sombre, favicon) **sauvegardables mais sans aucun effet visuel** — une fonctionnalité qui a l'air de marcher mais ne fait rien ;
- l'intégralité du JavaScript et du CSS de l'éditeur visuel est **livrée à tous les visiteurs publics**, pas seulement aux administrateurs ;
- aucun sitemap, robots.txt ou balise canonique, sur un site dont la finalité est explicitement commerciale ;
- toute l'autorisation admin repose sur un unique en-tête HTTP fourni par la plateforme d'hébergement, sans aucune vérification secondaire côté application — un point d'architecture à faire valider explicitement, pas un défaut de code en soi.

Rien dans le code n'indique de fonctionnalité entièrement « fausse » (pas de faux témoignages, pas de fausses statistiques, conformément à la philosophie du produit) ; les écarts trouvés sont des **fonctionnalités réelles mais incomplètement câblées**, pas des simulations trompeuses.

## B. Score (/10)

| Axe | Score | Justification courte |
|---|---:|---|
| Architecture | 7 | Séparation claire lib/app/db, source de vérité unique réelle ; duplication de contenus par défaut entre pages publiques et admin |
| Qualité du code | 6 | Style très dense (fonctions sur une seule ligne, `any` massif) qui nuit à la relecture ; logique correcte dans l'ensemble |
| Sécurité | 5,5 | Aucune injection SQL/XSS trouvée, mais confiance totale et non défendue sur un en-tête HTTP, pas de rate limiting, pas d'en-têtes de sécurité, pas de CSRF sur l'upload |
| Performance | 6 | Bon système de variantes d'images, mais éditeur chargé sur tout le trafic public, requêtes N+1, aucune mise en cache des pages publiques |
| Maintenabilité | 6 | Documentation d'audit exemplaire ; code très compact et peu testé (un seul test automatisé) |
| CMS | 7 | Couverture fonctionnelle large et fidèle à la philosophie produit ; quelques champs non reliés au rendu |
| Éditeur visuel | 7 | Résolution soignée du bug historique de perte de mode ; undo/redo et autosauvegarde réels ; lacunes d'accessibilité et de robustesse JSON |
| Médias | 5,5 | Pipeline d'upload fragile (cause probable du blocage à 100 %), détection d'usage imprécise, perte d'animation GIF |
| Données | 6 | Schéma clair et documenté, mais aucune FK/index, un vrai écart schéma/code trouvé |
| SEO | 5 | Métadonnées par page bien pensées, mais sitemap/robots/canonical totalement absents |

## C. Top 10 des risques

1. **[BLOQUANT]** La publication visuelle de Services/À propos écrit dans des colonnes qui n'existent pas en base → échec SQL garanti à l'usage. *(`lib/visual-editor.ts`)*
2. **[BLOQUANT]** Toute l'autorisation admin dépend d'un unique en-tête HTTP (`oai-authenticated-user-email`) sans vérification cryptographique côté application ; si la plateforme laisse jamais passer cet en-tête fourni par le client, c'est une élévation de privilège triviale vers l'accès CMS complet.
3. **[ÉLEVÉ]** Pipeline d'upload média à marge quasi nulle (640 Ko client vs 700 Ko serveur vs ~1 Mio de limite plateforme) — cause probable du blocage historique « à 100 % ».
4. **[ÉLEVÉ]** Crash par accès à une propriété d'une valeur `null` sur `/notre-travail` (chapitres → médias), non protégé contrairement à l'accueil.
5. **[ÉLEVÉ]** Détection d'usage d'un média avant suppression basée sur un `LIKE '%id%'` textuel — faux positifs/négatifs, incohérente avec la détection utilisée ailleurs dans le même fichier.
6. **[ÉLEVÉ]** Aucune contrainte de clé étrangère ni nettoyage transactionnel : la suppression forcée d'un média ou d'un projet laisse des références orphelines dans les JSON (`gallery_json`, `videos_json`, `cms_settings.value`).
7. **[ÉLEVÉ]** Formulaire public et upload média sans rate limiting, sans CAPTCHA, et upload en `multipart/form-data` (vecteur CSRF classique) sans jeton anti-CSRF ni confirmation de la politique de cookie de la plateforme.
8. **[ÉLEVÉ]** Champs CMS « logo clair », « logo sombre », « favicon » : enregistrables sans erreur, mais **jamais lus** par le rendu — le favicon est en dur sur un fichier statique.
9. **[MOYEN-ÉLEVÉ]** Aucun `sitemap.xml`, aucun `robots.txt`, aucune balise canonique nulle part dans le dépôt.
10. **[MOYEN-ÉLEVÉ]** `visual-editor.tsx`/`visual-editor.css` (et la médiathèque associée) sont importés sans condition dans les pages publiques et le layout racine → le bundle de l'éditeur est livré à 100 % des visiteurs anonymes, pas seulement aux admins connectés.

## D. Bugs probables (ce qui peut casser en production)

| # | Bug | Fichier | Cause précise |
|---|---|---|---|
| D1 | Échec SQL à la publication de Services/À propos | `lib/visual-editor.ts:43-44` | `UPDATE services … updated_by=? …` et `UPDATE team_members … updated_by=? …` alors que `services`/`team_members` n'ont pas de colonne `updated_by` (`db/schema.ts:8-9`, `drizzle/0000_fair_lilandra.sql:117-146`) |
| D2 | Crash serveur sur `/notre-travail` | `app/notre-travail/page.tsx` (bloc `chapters[i].media.map`) | `typeof entry==="object"?entry.id:entry` sans garde `entry &&` ; si `entry` vaut `null` (contenu JSON libre du CMS classique, non normalisé comme celui des projets), `entry.id` lève une exception non interceptée |
| D3 | Restauration d'une page projet republie toujours, même si le projet a été repassé en brouillon après le dernier instantané | `lib/visual-editor.ts:63-72` (`restoreVisualPage`) | `publishVisualProject({...snapshot,status:snapshot.status||"published"},…)` ignore le statut CMS courant |
| D4 | Message d'erreur trompeur après un remplacement de média réussi | `app/api/admin/media/route.ts:107-115` | Si `removeObjects(old…)` échoue après la mise à jour D1 réussie, la variable `stage` reste à `"d1-metadata"` → l'admin voit « informations non enregistrées » alors que le remplacement a fonctionné |
| D5 | Perte d'animation des GIF | `app/admin/media-library.tsx:48-51` | `createImageBitmap` + `canvas.toBlob("image/webp")` ne capture qu'une image fixe pour tout type d'image, GIF compris |
| D6 | Échec d'optimisation sur images très lourdes (ex. 24 Mpx) | `app/admin/media-library.tsx:49` | La boucle de compression peut ne jamais descendre sous 640 Ko avant `target<320`, et lève alors une erreur bloquant tout l'upload |
| D7 | Fenêtre de concurrence sur le projet « mis en avant » | `app/api/admin/cms/route.ts:71-75` | L'insert/update du projet, le `UPDATE … featured=0 WHERE id<>?` et le `batch()` des sections sont 3 opérations séparées non atomiques : deux admins concurrents peuvent laisser deux projets `featured=1` |
| D8 | Aucune limite de taille pour les réglages CMS classiques | `app/api/admin/cms/route.ts` (resource `settings`) | Le plafond de 180 000 caractères n'existe que pour `saveVisualDraft` (`lib/visual-editor.ts:15`), pas pour l'enregistrement classique des paramètres |
| D9 | Notes internes des demandes jamais réaffichées | `app/admin/admin-app.tsx` (`Inquiries`) + `app/api/admin/cms/route.ts` (`resource==="inquiries"`) | `inquiry_notes` est alimentée en écriture mais jamais lue/jointe ; la modale ne propose qu'un nouveau champ de note, sans historique |

## E. Dette technique

- **Contenus par défaut dupliqués** : `homeDefaults` (et équivalents pour about/services/contact/work) sont définis séparément dans les pages publiques (`app/page.tsx`) **et** dans `app/admin/admin-app.tsx`, avec les mêmes valeurs recopiées à la main. Toute évolution de structure doit être répercutée aux deux endroits, sans garde-fou de compilation qui l'impose.
- **Style de code extrêmement dense** : de très nombreuses fonctions (routes API, `lib/visual-editor.ts`, `admin-app.tsx`, `project-manager.tsx`) tiennent sur une seule ligne de plusieurs centaines de caractères. C'est fonctionnel, mais cela rend la relecture, le diff Git et la détection de régression nettement plus difficiles qu'un style aéré — un vrai coût de maintenabilité à mesure que l'équipe grandit.
- **Typage `any` généralisé** côté client (`Item=Record<string,any>`, payloads d'API non typés) : TypeScript est présent dans les dépendances mais n'apporte qu'une fraction de sa valeur de garde-fou.
- **Normalisation JSON incohérente** : `lib/public-cms.ts` normalise proprement `gallery`/`sections` pour les projets (table `projects`), mais les contenus stockés en JSON libre dans `cms_settings` (accueil, travail, services, à propos, contact) ne passent par aucune normalisation centralisée — d'où le bug D2 et le risque que d'autres pages aient le même point faible sans qu'il se soit encore manifesté.
- **`admin_users` et sa colonne `role`** existent en base (table + migration) mais ne sont interrogées nulle part dans le code : c'est une pièce de schéma morte, un futur terrain à ambiguïté (« pourquoi ça ne marche pas si je change le rôle ? »).
- **Aucune contrainte d'intégrité référentielle** (FK, index sur les colonnes de relation) : le modèle documente lui-même ce choix (`DATA_MODEL.md`) ; c'est un choix simple à court terme mais qui déplace tout le poids de la cohérence sur le code applicatif, qui ne le tient pas complètement (cf. D6, D7, risques 5 et 6).
- **Couverture de tests quasi nulle** : un seul test automatisé vérifie une métadonnée HTML de développement (`tests/rendered-html.test.mjs`). Aucun test unitaire (normalisation JSON, slug, galerie), aucun test d'API avec bindings D1/R2 simulés, aucun test end-to-end du parcours connexion → édition → publication.

## F. Ce qui est bien conçu

- **Source de vérité réellement unique** : CMS classique et éditeur visuel lisent/écrivent exactement les mêmes tables D1 et les mêmes clés `cms_settings`. Il n'y a ni `localStorage`, ni fichier de config parallèle, ni mock, pour le contenu réel du site.
- **Résolution soignée du bug historique de perte du mode édition** : le cookie HTTP-only `dm_visual_editor` (8 h, `SameSite=lax`, `secure`) découple l'état d'édition de la mémoire d'une page particulière ; `?edit=1` n'est conservé que comme compatibilité, plus comme mécanisme principal. C'est exactement la bonne réponse architecturale au problème décrit dans le contexte produit.
- **Aucune injection SQL détectée** : toutes les requêtes utilisent des requêtes préparées avec liaison de paramètres (`.bind()`), y compris dans les routes de recherche. Les rares concaténations de chaînes SQL trouvées ne portent que sur des noms de table venant d'une liste fermée en dur, jamais sur une entrée utilisateur.
- **Pas de `dangerouslySetInnerHTML`** : l'édition de texte en ligne repose sur `.innerText` et un re-rendu React classique (échappement automatique), ce qui referme une bonne partie de la surface XSS que ce type d'éditeur ouvre habituellement.
- **Utilisation correcte de `.batch()`** pour les plus grosses écritures multi-tables (publication de l'accueil, d'une page de réglages, d'un projet avec ses sections), garantissant une vraie atomicité là où elle compte le plus.
- **Pipeline de variantes d'images pensé pour la performance** : quatre variantes (thumbnail/mobile/desktop/original), `<picture>`/`srcSet` pour le hero mobile, cache immuable d'un an sur `/api/media/[id]`.
- **Discipline de marque réellement appliquée dans le code** : le principe « contenu flexible + design verrouillé » n'est pas qu'un slogan — l'éditeur visuel ne permet strictement que d'éditer texte/médias/ordre/visibilité, jamais le CSS ou la structure des composants, ce qui protège l'identité visuelle comme demandé dans le contexte produit.
- **Défauts de sécurité sûrs par construction** : si `ADMIN_EMAILS` est vide ou absent, personne n'est admin (échec fermé, pas ouvert) ; le nom de fichier de téléchargement est assaini contre l'injection d'en-tête.
- **Auto-documentation exemplaire** : `README_AUDIT.md`, `DATA_MODEL.md`, `ROUTES_AND_API.md` et `AUDIT_TEST_CHECKLIST.md`, déjà fournis avec le paquet, identifient honnêtement une bonne partie des limites connues avant même cet audit externe — un signe de maturité d'ingénierie peu commun pour une jeune structure.

## G. Détail des constats par thème

Pour chaque constat : **criticité** · fichier/zone · cause · impact · scénario de risque · correction recommandée · effort.

### 1–2. Architecture & qualité du code
- **[MOYEN]** Duplication des contenus par défaut entre pages publiques et `admin-app.tsx` (cf. section E). *Correction :* extraire un module `lib/content-defaults.ts` partagé. *Effort : S.*
- **[FAIBLE]** Incohérence de composition : les pages Accueil et Projet composent `Header`/`Footer` directement, alors que Services/Travail/À propos/Contact utilisent `PageShell`. Fonctionnellement identique, mais deux façons de faire la même chose. *Effort : XS.*
- **[MOYEN]** Style de code très dense (fonctions monolithiques sur une ligne) sur la majorité des fichiers `lib/*` et `app/api/*`. *Impact :* revues de code et diffs Git plus difficiles à auditer dans la durée. *Effort : M (reformatage progressif, sans changement de logique).*

### 3. Base de données D1
- **[BLOQUANT]** Écart schéma/code sur `services.updated_by` et `team_members.updated_by` (D1 dans la section D). *Correction :* migration ajoutant les colonnes, ou suppression de ces champs des requêtes `UPDATE`. *Effort : S.*
- **[ÉLEVÉ]** Aucune clé étrangère, aucun index sur les colonnes de relation (`cover_media_id`, `project_id`, IDs contenus dans les JSON). *Impact :* références orphelines silencieuses, pas d'erreur de contrainte pour détecter un bug applicatif. *Effort : L (introduction progressive de FK + backfill).*
- **[MOYEN]** Pas de plafond de taille pour `cms_settings.value` hors chemin brouillon visuel (D8). *Effort : XS.*
- **[FAIBLE]** `admin_users`/`role` : table et migration présentes mais jamais consultées. *Correction :* la supprimer ou la câbler à une vraie gestion de rôles. *Effort : XS (suppression) à M (implémentation réelle).*

### 4. Médias / R2
- **[BLOQUANT/ÉLEVÉ]** Marge quasi nulle entre le budget client (640 Ko), la limite serveur (700 Ko) et la limite plateforme (~1 Mio avant même que le Worker s'exécute) — cause la plus probable du blocage à 100 % déjà observé, en particulier si l'overhead multipart (nom de fichier Unicode, champs additionnels) fait franchir le seuil silencieusement côté plateforme (pas de réponse HTTP propre, le XHR ne se résout ni ne rejette proprement). *Correction :* réduire encore la cible client, ajouter un timeout explicite plus court que les 90 s actuels avec message dédié, et instrumenter le taux d'échec réel. *Effort : M.*
- **[ÉLEVÉ]** Détection d'usage avant suppression par simple `LIKE '%id%'` textuel (`app/api/admin/media/route.ts`, handler `DELETE`), différente et moins précise que la détection par expression régulière utilisée dans `resource==="media"` du même fichier. *Impact :* un média non utilisé peut être bloqué à tort (ID substring d'un autre ID), et la logique diverge selon l'endroit où on regarde. *Correction :* unifier sur une seule fonction d'usage qui parse réellement le JSON. *Effort : S-M.*
- **[MOYEN]** Perte d'animation des GIF à l'upload (D5). *Effort : M.*
- **[MOYEN]** Échec d'optimisation sur images très lourdes (D6). *Effort : M.*
- **[MOYEN]** Message d'erreur trompeur après remplacement réussi si le nettoyage R2 échoue (D4). *Effort : XS.*
- **[FAIBLE]** Le champ `custom_thumbnail_media_id` est géré par l'API (vidéo externe) et affiché par `MediaThumb`, mais le formulaire d'ajout de vidéo externe (`app/admin/media-library.tsx`, `external` state) ne propose aucun champ pour le renseigner — fonctionnalité accessible par API seulement, invisible dans l'UI. *Effort : XS.*

### 5. Authentification / autorisation
- **[À VÉRIFIER — potentiellement BLOQUANT]** Toute l'autorisation admin repose sur la confiance accordée à l'en-tête `oai-authenticated-user-email`, lu tel quel par `app/chatgpt-auth.ts` puis comparé à `ADMIN_EMAILS` (`lib/admin-auth.ts`). Le code applicatif ne vérifie **aucune signature** de cet en-tête : la sécurité entière dépend d'une garantie externe (la plateforme d'hébergement doit empêcher un client de fournir lui-même cet en-tête). *Scénario de risque :* si un point d'entrée quelconque contourne l'injection contrôlée par la plateforme, n'importe quel visiteur peut s'auto-déclarer administrateur et obtenir un accès complet au CMS. *Recommandation :* obtenir et documenter la confirmation explicite (de la plateforme) que ces en-têtes sont strippés côté client puis réinjectés uniquement après authentification réelle ; envisager une défense en profondeur (jeton signé vérifiable côté Worker). *Effort : S (documentation/vérification) à L (défense en profondeur).*
- **[MOYEN]** Aucun rôle différencié : `admin_users.role` existe mais n'est pas utilisé ; un seul niveau d'accès pour toute personne listée dans `ADMIN_EMAILS`. *Effort : M.*
- **[MOYEN]** Aucun jeton anti-CSRF sur les routes de mutation ; l'upload média (`multipart/form-data`) est en particulier un vecteur CSRF classique côté navigateur si la session admin de la plateforme repose sur un cookie envoyé automatiquement inter-sites. *Correction :* vérifier la politique `SameSite` du cookie de session de la plateforme, ajouter un jeton anti-CSRF applicatif si nécessaire. *Effort : S-M.*
- **[BIEN CONÇU]** Défaut fermé si `ADMIN_EMAILS` est vide ; comparaison insensible à la casse ; le cookie d'édition est `HttpOnly`/`Secure`/`SameSite=lax` avec expiration à 8 h.

### 6. Éditeur visuel
- **[BIEN CONÇU]** Le passage à un cookie de session global résout proprement le problème historique de perte du mode édition en navigant entre pages.
- **[ÉLEVÉ]** Crash `null` sur `/notre-travail` (D2), absent de l'accueil qui a reçu un correctif ciblé mais non généralisé.
- **[MOYEN]** Réordonnancement des galeries (dans `visual-editor.tsx` et `project-manager.tsx`) uniquement par glisser-déposer HTML5 natif, sans alternative clavier — alors que le réordonnancement des **sections**, lui, dispose bien de boutons « Monter/Descendre ». Incohérence d'accessibilité entre deux fonctionnalités similaires du même éditeur. *Effort : S.*
- **[MOYEN]** Aucune gestion d'`Escape`, aucun `role="dialog"`/`aria-modal` sur les panneaux et modales de l'éditeur (`ve-sheet`, `ve-modal`, `ve-context`) ni sur les modales de l'admin classique — confirmé par recherche exhaustive dans le code (aucune occurrence). *Effort : M.*
- **[FAIBLE]** `restoreVisualPage` republie toujours un projet (D3).

### 7. Source de vérité
- **[CONFIRMÉ SAIN]** CMS classique, éditeur visuel et rendu public interrogent tous la même base D1, sans copie parallèle des données réelles. La seule dualité volontaire est brouillon (`visual_draft_<page>`) vs publié, ce qui est le comportement attendu d'un système de brouillon.
- **[MOYEN]** La duplication concerne uniquement les **valeurs par défaut** de contenu (voir section E), pas les données réelles — un risque de divergence de présentation par défaut, pas de perte de données.

### 8. Publication
- **[FAIBLE]** Pas d'endpoint « dépublier » dédié : le CMS repasse simplement `status` à `draft`, ce qui est cohérent mais mérite d'être documenté comme volontaire plutôt que manquant.
- **[MOYEN]** `restoreVisualPage` republie systématiquement un projet même si son statut CMS courant est `draft` (D3).
- **[MOYEN]** Pas de garde de taille sur les réglages CMS classiques (D8), risque de dépassement silencieux des limites pratiques de `cms_settings.value`.
- **[BIEN CONÇU]** Utilisation de `audit_log.snapshot_json` comme point de restauration avant chaque publication, avec traçabilité de l'auteur — un vrai filet de sécurité, même si ce n'est pas un système de versionnement complet (limite déjà documentée par l'équipe).

### 9. Demandes clients
- **[ÉLEVÉ]** Aucun rate limiting ni CAPTCHA sur `POST /api/inquiries`, seul un champ honeypot protège contre le spam automatisé basique. *Effort : S (rate limiting basique) à M (CAPTCHA).*
- **[MOYEN]** Notes internes jamais réaffichées après écriture (D9).
- **[BIEN CONÇU]** Validation superficielle mais suffisante côté serveur (email contient `@`, champs requis), troncature systématique des champs texte, `extra_json` isolé proprement pour les champs dynamiques du formulaire.
- **[FAIBLE]** Aucune notification (email/Slack) à la réception d'une nouvelle demande : l'équipe doit se connecter au CMS pour le savoir, hors badge de compteur dans le tableau de bord.

### 10. SEO
- **[ÉLEVÉ]** Aucun `sitemap.xml`, aucun `robots.txt` dans tout le dépôt (`public/` ne contient que logos, favicon, image Open Graph). *Effort : S.*
- **[MOYEN]** Aucune balise canonique (`alternates.canonical`) sur aucune page. *Effort : XS-S.*
- **[BIEN CONÇU]** `generateMetadata` par page et par projet, avec titre/description/OG dynamiques pilotés par le CMS ; `/admin` correctement en `noindex,nofollow` ; la page projet gère correctement le `noindex` en mode aperçu/édition.
- **[FAIBLE]** Incohérence mineure : seule la page projet applique `noindex` conditionnel sur `?preview=1`, pas les autres pages publiques (risque réel très faible puisque le contenu de brouillon n'est de toute façon visible qu'à un admin connecté).

### 11. Performance
- **[ÉLEVÉ]** `app/visual-editor.tsx` (composant client, ~16 Ko) est importé sans condition dans **toutes** les pages publiques, et `app/visual-editor.css` (~7,6 Ko) est importé dans `app/layout.tsx`, donc chargé par 100 % des visiteurs anonymes qui ne verront jamais l'éditeur. *Correction :* import dynamique (`next/dynamic`, `ssr:false`) conditionné à `edit||preview`, et déplacement du CSS de l'éditeur hors du layout racine. *Effort : S.*
- **[MOYEN]** Requêtes N+1 : `GET /api/admin/cms?resource=projects` interroge `project_sections` une fois par projet ; le calcul des usages média (`resource==="media"`) recharge l'intégralité des projets/sections/réglages/services/équipe et fait un balayage imbriqué en JavaScript à chaque affichage de la médiathèque. *Impact :* dégradation progressive à mesure que le portfolio grandit. *Effort : M.*
- **[MOYEN]** Toutes les pages publiques sont `force-dynamic` sans aucun en-tête de cache ni ISR, contrairement à `/api/content/settings` qui, lui, a un cache de 60 s. *Effort : M.*
- **[BIEN CONÇU]** Système de variantes d'images (thumbnail/mobile/desktop/original) et cache immuable d'un an sur les médias servis.

### 12. Mobile / responsive
- Non vérifiable par lecture statique seule (pas de rendu réel possible dans cet environnement). Le CSS dédié (`admin.css`, `visual-editor.css`) montre une intention de traitement mobile (media queries présentes), mais une vérification manuelle sur appareil réel — déjà prévue dans `AUDIT_TEST_CHECKLIST.md` — reste nécessaire, en particulier pour le glisser-déposer sur tactile (voir point d'accessibilité ci-dessous, sans alternative tactile/clavier explicite dans le code lu).

### 13. Accessibilité
- **[ÉLEVÉ]** Aucune gestion d'`Escape`, aucun `role="dialog"`/`aria-modal` sur aucune modale (confirmé par recherche exhaustive : zéro occurrence dans tout `app/`). *Effort : M.*
- **[MOYEN]** Réordonnancement des galeries uniquement par glisser-déposer, sans équivalent clavier (contrairement aux sections). *Effort : S.*
- **[FAIBLE]** Peu d'attributs `aria-*`/`role` dans l'ensemble de l'application (5 fichiers sur toute l'app utilisent `aria-`, 4 utilisent `role=`), pour une interface pourtant riche en interactions (panneaux, bascules, glisser-déposer).
- **[BIEN CONÇU]** Textes alternatifs éditables par média (`alt`) pour les galeries et projets, réellement branchés au rendu (`alt={entry.alt||title}`), pas de simple `alt=""` généralisé.

### 14. Sécurité globale
- Injection SQL : **non trouvée** (requêtes paramétrées partout).
- XSS stocké via texte CMS : **non trouvé** (pas de `dangerouslySetInnerHTML`, rendu React échappé).
- **[FAIBLE-MOYEN]** XSS via URL de lien/CTA : les champs `data-link-url-key` (boutons CTA) sont utilisés tels quels dans `href` sans validation de protocole ; un compte admin compromis pourrait y placer une URL `javascript:`. Risque limité par le fait que seul un admin déjà autorisé peut écrire ce champ, mais absence de défense en profondeur. *Effort : XS.*
- CSRF : voir section 5 (upload média en particulier).
- En-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) : **absents** de toute la configuration (`next.config.ts` vide, aucun middleware). *Effort : S.*
- Rate limiting : **absent partout**, y compris sur les routes admin elles-mêmes (un compte compromis n'a aucune limite de débit d'appel API).
- Secrets : `.env.example` ne contient qu'`ADMIN_EMAILS`, aucun secret en dur trouvé dans le code lu.
- Path traversal / MIME spoofing sur upload : les extensions et types MIME sont vérifiés par liste blanche (`IMAGE_TYPES`/`VIDEO_TYPES`), les clés R2 sont construites à partir d'un UUID généré serveur-compatible et validé par regex, pas du nom de fichier utilisateur — **bien conçu** sur ce point précis.

### 15. Fonctionnalités simulées / incomplètes

| Fonctionnalité | Ce qu'elle semble faire | Ce qu'elle fait réellement | Statut |
|---|---|---|---|
| Logo clair / logo sombre (réglages généraux) | Choisir un média, l'enregistrer sans erreur | N'est lu par aucun composant de rendu (`Header`/`Footer` ne lisent que `logoMainId`/`logoOrangeId`) | **Incomplète — sans effet** |
| Favicon personnalisé (réglages généraux) | Uploader/choisir un favicon | `app/layout.tsx` pointe en dur sur `/favicon.svg` statique, jamais lu depuis `general.faviconId` | **Incomplète — sans effet** |
| Miniature personnalisée pour vidéo externe | Champ existant côté API et côté affichage (`custom_thumbnail_media_id`) | Aucun champ dans le formulaire d'ajout de vidéo externe pour le renseigner | **Backend prêt, UI manquante** |
| Rôles administrateurs (`admin_users.role`) | Table dédiée dans le schéma | Jamais lue par le contrôle d'accès, qui n'utilise que `ADMIN_EMAILS` | **Schéma mort** |
| Notes internes sur une demande | Champ de saisie dans la modale Demandes | Écrites en base mais jamais relues/affichées | **Écriture seule** |

Aucune fonctionnalité n'a été trouvée reposant sur `localStorage` pour du contenu réel, ni sur des données mockées côté client — cohérent avec la philosophie « pas de fausse expérience » du produit.

## H. Plan de remédiation

**Phase 1 — Bloquants**
1. Corriger l'écart `services.updated_by`/`team_members.updated_by` (migration ou retrait du champ des requêtes).
2. Corriger le crash `null` sur `/notre-travail` (chapitres → médias) ; auditer les autres pages `cms_settings` pour le même pattern.
3. Réduire encore les marges du pipeline d'upload, ajouter un timeout explicite avec message clair, instrumenter le taux d'échec.
4. Obtenir/documenter la confirmation explicite que `oai-authenticated-user-email` ne peut pas être fourni par un client non authentifié.

**Phase 2 — Sécurité**
5. Rate limiting + CAPTCHA sur `/api/inquiries`.
6. En-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy).
7. Défense anti-CSRF sur l'upload média (vérifier `SameSite` de la session plateforme, ajouter un jeton si nécessaire).
8. Valider/filtrer les URL de CTA contre le schéma `javascript:`.
9. Décider du sort de `admin_users`/`role` : supprimer ou implémenter réellement.

**Phase 3 — Architecture**
10. Centraliser les contenus par défaut dupliqués dans un module partagé.
11. Centraliser la normalisation des tableaux médias/galeries JSON dans une seule fonction utilisée par toutes les pages.
12. Rendre atomique la séquence création de projet + retrait du « mis en avant » + sections (un seul `.batch()`).
13. Ajouter un plafond de taille cohérent sur tous les enregistrements `cms_settings.value`.
14. Unifier les deux logiques de détection d'usage média sur une seule fonction fiable.

**Phase 4 — UX CMS/éditeur**
15. Afficher l'historique des notes internes sur une demande.
16. Câbler logo clair/sombre/favicon au rendu réel, ou retirer ces champs du CMS.
17. Ajouter le champ miniature au formulaire de vidéo externe.
18. Ajouter des boutons de réordonnancement clavier aux galeries (comme pour les sections).
19. Ajouter `role="dialog"`/`aria-modal`/fermeture `Escape` à toutes les modales et panneaux.

**Phase 5 — Performance**
20. Import dynamique de `VisualEditor` (non chargé pour les visiteurs anonymes), sortir `visual-editor.css` du layout racine.
21. Résoudre les requêtes N+1 (sections par projet, calcul des usages média).
22. Ajouter du cache/ISR sur les pages publiques.

**Phase 6 — Finitions**
23. Ajouter `sitemap.xml`, `robots.txt`, balises canoniques.
24. Corriger le message d'erreur trompeur après un remplacement de média réussi.
25. Ajouter des tests : normalisation JSON/slug/galerie, API avec bindings D1/R2 simulés, E2E connexion → édition → publication.
26. Préserver l'animation des GIF à l'upload, ou documenter explicitement la limitation pour l'équipe.

## I. Fichiers prioritaires (ordre d'intervention recommandé)

1. `lib/visual-editor.ts` — bug bloquant de schéma, logique de restauration.
2. `app/api/admin/media/route.ts` — pipeline d'upload, détection d'usage, suppression.
3. `app/notre-travail/page.tsx` — crash `null` reproductible.
4. `lib/admin-auth.ts` + `app/chatgpt-auth.ts` — frontière de confiance à faire valider explicitement.
5. `app/admin/media-library.tsx` — compression client, GIF, champ manquant pour la miniature vidéo.
6. `app/admin/admin-app.tsx` — contenus par défaut dupliqués, champs logo/favicon sans effet.
7. `db/schema.ts` + `drizzle/*.sql` — stratégie FK/index, table `admin_users` morte.
8. `app/api/admin/cms/route.ts` — requêtes N+1, écritures non atomiques, calcul d'usage en boucle imbriquée.
9. `app/layout.tsx` + `app/visual-editor.tsx` — bundle/CSS livrés à tous les visiteurs.
10. `app/api/inquiries/route.ts` — absence de rate limiting/CAPTCHA.

---

*Cet audit n'a modifié aucun fichier du projet. Il constitue une base de décision ; chaque correction proposée doit être validée et testée en environnement de démonstration séparé (D1/R2 de test) avant tout déploiement en production, conformément à `AUDIT_TEST_CHECKLIST.md` déjà fourni par l'équipe.*
