# Checklist d’audit et de validation

Utiliser un environnement de staging distinct avec D1/R2 de test. Ne jamais exécuter les tests destructifs sur la production sans sauvegarde.

## Automatique

- [ ] `npm ci` réussit avec Node `>=22.13.0`.
- [ ] `npm run lint` réussit ou chaque alerte est qualifiée.
- [ ] `npm run build` produit un Worker dont `fetch()` est callable.
- [ ] `npm test` réussit.
- [ ] Ajouter tests unitaires pour normalisation JSON, galerie contenant `null`, nettoyage texte et slugs.
- [ ] Ajouter tests API avec faux bindings D1/R2 pour auth, médias, projets, demandes et éditeur.
- [ ] Ajouter tests E2E desktop/mobile pour le parcours connexion → édition → preview → publication.
- [ ] Comparer `db/schema.ts`, snapshots Drizzle et SQL réellement appliqué.
- [ ] Scanner dépendances et secrets ; produire SBOM si requis.

## Authentification et permissions

- [ ] Visiteur non connecté : `/admin` propose la connexion ; API admin retourne 401.
- [ ] Utilisateur connecté mais non autorisé : accès refusé partout.
- [ ] Admin autorisé : CMS et éditeur accessibles.
- [ ] Expiration/déconnexion invalide le mode édition.
- [ ] Vérifier confiance et impossibilité de forger les en-têtes d’identité hors plateforme.
- [ ] Confirmer besoin de rôles ; tester ou supprimer la table `admin_users` inutilisée.

## Média et R2

- [ ] Upload JPEG, PNG, WebP, GIF ; vérifier les quatre variantes, dimensions et métadonnées.
- [ ] Vérifier explicitement si GIF animé doit rester animé.
- [ ] Upload multiple : succès partiel, échec/retry, ordre et isolation des tâches.
- [ ] Tester fichier très grand, panorama, portrait 24 Mpx, transparence, nom Unicode.
- [ ] Tester chaque partie autour de 640/700 Kio et réponse 413.
- [ ] Tester coupure réseau avant/après chaque variante et absence d’objets R2 orphelins.
- [ ] Remplacement : nouvelle ressource visible, anciennes clés supprimées seulement après succès.
- [ ] Vidéo courte sous limite ; MP4/WebM/MOV ; vidéo trop grande ; URL YouTube/Vimeo/externe.
- [ ] Lecture thumbnail/mobile/desktop/original, cache, téléchargement et 404.
- [ ] Suppression média utilisé : 409, liste des usages, annulation et force.
- [ ] Corbeille → restauration → suppression définitive ; vérifier D1 et R2.

## CMS et données

- [ ] Créer/modifier/dupliquer si prévu un projet ; slug unique et erreurs de collision.
- [ ] Brouillon projet non visible publiquement.
- [ ] Publier puis vérifier couverture, galerie, chapitres, légendes, vidéo et SEO.
- [ ] Dépublier vers `draft`; archiver ; restaurer si applicable.
- [ ] Projet vedette unique et ordre d’affichage.
- [ ] Visibilité services et équipe ; ordre ; média associé.
- [ ] Tester la publication visuelle de Services/À propos et l’écart `updated_by`.
- [ ] Vérifier audit log, auteur, snapshot et restauration.
- [ ] Vérifier persistance après redémarrage et nouveau déploiement.

## Formulaire et Demandes

- [ ] Soumettre chaque type d’événement avec champs dynamiques.
- [ ] Validation champs requis, email invalide, honeypot.
- [ ] Vérifier écriture `inquiries`/`extra_json` et absence de données perdues.
- [ ] CMS Demandes : filtrer, rechercher, priorité, statut, relance, traité, archive.
- [ ] Ajouter une note puis vérifier sa récupération et son affichage.
- [ ] Tester rate limiting/spam/charges volumineuses ; documenter les protections manquantes.

## Éditeur visuel global

- [ ] Activer depuis l’admin ; parcourir Accueil → Services → À propos → Notre travail → Contact → projet sans perdre le mode.
- [ ] Rafraîchir chaque route et ouvrir dans un nouvel onglet avec session active.
- [ ] Cliquer chaque texte CMS : édition inline, validation, annulation, style conservé.
- [ ] Modifier CTA et URL ; vérifier liens sûrs et comportement public.
- [ ] Remplacer image, bibliothèque, alt, retrait, cadrage.
- [ ] Galerie : ajouter deux images, réordonner par glisser-déposer, alt/légende, retirer.
- [ ] Réordonner sections ; confirmer header/navigation/footer verrouillés.
- [ ] Masquer/restaurer une section puis publier.
- [ ] Ajouter chaque type de bloc à plusieurs positions ; recharger et publier.
- [ ] Undo/redo, autosauvegarde, état dirty et avertissement de fermeture.
- [ ] Preview sans aucun contrôle d’édition ; retour éditeur.
- [ ] Public conserve dernière version pendant le brouillon ; mise à jour après publication.
- [ ] Restaurer dernière version et vérifier l’historique.
- [ ] Tester contenus vides, `null`, tableaux incomplets et brouillon proche de 180 000 caractères.

## Mobile, UX et accessibilité

- [ ] iPhone Safari et Android Chrome : navigation, tap, bottom sheet, médiathèque.
- [ ] Contrôles toujours accessibles sans masquer le contenu ni déborder horizontalement.
- [ ] Drag-and-drop avec alternative tactile/clavier.
- [ ] Focus visible, tabulation, fermeture Escape, libellés accessibles, annonces d’état.
- [ ] Zoom texte 200 %, contraste, tailles tactiles, orientation paysage.

## SEO, sécurité et exploitation

- [ ] Titres/descriptions/OG par page et projet ; URLs média absolues attendues par les robots.
- [ ] `noindex` sur admin, preview et contenus privés.
- [ ] Vérifier XSS via textes, légendes, URLs et noms de fichiers.
- [ ] Vérifier CSRF sur mutations admin et politique SameSite/cookie.
- [ ] Vérifier transactions, concurrence d’édition et écrasements simultanés.
- [ ] Vérifier logs sans données sensibles et métriques d’échec upload/publication.
- [ ] Tester migration complète sur base vide puis sur copie anonymisée d’une base existante.
- [ ] Documenter sauvegarde, restauration, rollback et rotation de `ADMIN_EMAILS`.

