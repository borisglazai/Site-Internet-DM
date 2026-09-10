# Changelog — Phase 1 (Bloquants)

Portée : uniquement les 4 correctifs bloquants identifiés dans
`AUDIT_DIVINE_MOTION.md`. Aucun changement visuel, aucune nouvelle
fonctionnalité, aucun refactor hors du strict nécessaire à ces correctifs.
Chaque affirmation de ce document a été vérifiée en conditions réelles
(build complet + serveur de développement avec D1/R2 simulés localement) —
voir `TEST_REPORT_PHASE1.md` pour le détail et les preuves (requêtes,
réponses, avant/après).

---

## 1. Écart de schéma SQL (`services`/`team_members`)

**Fichiers modifiés** : `lib/visual-editor.ts`

**Problème initial** : `publishVisualSettingsPage()` exécutait, lors de la
publication visuelle des pages Services et À propos :

```sql
UPDATE services SET ...,updated_by=?,... WHERE id=? AND deleted_at IS NULL
UPDATE team_members SET ...,updated_by=?,... WHERE id=? AND deleted_at IS NULL
```

Or ni `services` ni `team_members` ne possèdent de colonne `updated_by`
(`db/schema.ts`, `drizzle/0000_fair_lilandra.sql`,
`drizzle/0001_steep_kulan_gath.sql`). Chaque publication visuelle d'une page
Services ou À propos contenant un service/membre existant échouait donc
systématiquement avec `D1_ERROR: no such column: updated_by`. **Reproduit et
confirmé** dans cet environnement (voir `TEST_REPORT_PHASE1.md`, section 1).

**Choix de correction — retirer l'écriture plutôt qu'ajouter la colonne** :
les deux tables `services`/`team_members` ne suivent déjà `updated_by`
**nulle part ailleurs** dans le code — ni dans les migrations, ni dans le
chemin CMS classique (`app/api/admin/cms/route.ts`, resources `service` et
`team`, qui écrivent `updated_at` mais jamais `updated_by`). Ajouter la
colonne n'aurait résolu le problème que pour le seul chemin de l'éditeur
visuel, laissant une colonne alimentée de façon incohérente selon le point
d'entrée utilisé pour la même table — une nouvelle source de confusion, pas
une vraie amélioration. Retirer `updated_by` de ces deux requêtes aligne
l'éditeur visuel sur la convention déjà établie par le reste du code pour ces
deux tables précises, sans migration, sans changement de schéma, et avec un
risque de régression minimal. `projects` et `cms_settings`, qui possèdent
réellement `updated_by` et l'utilisent de façon cohérente partout, ne sont
pas concernées par ce changement.

**Vérification systématique des autres tables** : chaque colonne écrite par
`lib/visual-editor.ts` pour `cms_settings`, `projects`, `project_sections`,
`services` et `team_members` a été confrontée une à une à `db/schema.ts`
(voir `tests/schema-sql-consistency.test.ts`, qui encode ce contrôle comme
test automatisé permanent). Aucun autre écart trouvé.

**Impact** : les publications visuelles de Services et À propos fonctionnent
désormais. Aucun changement de comportement pour l'accueil, les projets, ou
le CMS classique.

**Migration** : aucune. Changement de code seul.

---

## 2. Crash par valeur `null` sur `/notre-travail`

**Fichiers modifiés** : `app/notre-travail/page.tsx` (correction directe),
`lib/media-normalize.ts` (nouveau, fonction partagée), `lib/public-cms.ts`,
`app/visual-editor.tsx`, `app/admin/project-manager.tsx` (consolidation des
normalisations déjà existantes mais dupliquées trois fois).

**Problème initial** : `app/notre-travail/page.tsx` lisait
`chapter.media.map((entry) => typeof entry==="object" ? entry.id : entry)`
sans protéger le cas `entry === null` (`typeof null === "object"` en
JavaScript, donc `entry.id` est évalué et lève `Cannot read properties of
null (reading 'id')`). `work.chapters` vient d'un JSON libre stocké dans
`cms_settings`, sans normalisation préalable contrairement aux galeries de
projets (`lib/public-cms.ts`, qui filtrait déjà correctement ce cas).
**Reproduit et confirmé** : voir `TEST_REPORT_PHASE1.md`, section 2, avec le
message d'erreur exact obtenu avant correction.

**Correction** : nouvelle fonction pure `lib/media-normalize.ts`
(`normalizeMediaEntry`, `normalizeMediaList`, `normalizeChapterMedia`), sans
dépendance à Next.js/Cloudflare, qui tolère explicitement `null`, `undefined`,
chaîne, nombre, objet complet, objet partiel et valeur invalide (tableau,
booléen) — toute entrée qui ne désigne pas un média exploitable est
silencieusement écartée plutôt que de faire planter le rendu.
`app/notre-travail/page.tsx` normalise désormais `work.chapters` juste avant
le rendu (avec `includeHidden: true`, pour ne rien changer au comportement
existant qui n'a jamais filtré les médias masqués sur cette page).

**Audit des chemins similaires** (demandé explicitement) : trois
implémentations de normalisation de galerie, quasi identiques mais
légèrement différentes, coexistaient déjà dans le code :

- `lib/public-cms.ts` (`projectFromRow`) — filtrait déjà correctement `null`
  et les entrées sans id, en plus de retirer les médias masqués (comportement
  public). Remplacée par `normalizeMediaList(..., {includeHidden:false})`,
  comportement identique, code partagé.
- `app/visual-editor.tsx` (panneau galerie de l'éditeur) — filtrait déjà
  `null`/entrées sans id, mais dupliquait la logique. Remplacée par
  `normalizeMediaList(..., {includeHidden:true})`.
- `app/admin/project-manager.tsx` (galerie d'un projet dans le CMS) —
  **ne filtrait pas** les entrées invalides du tout (un `null` produisait un
  objet sans `id`, affichant une image cassée dans l'éditeur plutôt qu'un
  crash serveur, mais un vrai défaut). Corrigée par le même remplacement.

Ces trois usages passent maintenant par la même fonction testée
(`tests/media-normalize.test.ts`), au lieu de trois implémentations
divergentes.

**Ce qui n'a pas été changé** : le comportement de filtrage (public vs
éditeur) de chaque site d'appel est préservé à l'identique — ce correctif ne
change aucune donnée affichée pour un contenu déjà valide, il ne fait que
tolérer les entrées invalides sans planter.

**Impact** : `/notre-travail` (et tout autre usage futur de ces fonctions
partagées) tolère désormais un `null`/`undefined` dans un tableau de médias,
sans régression sur le rendu des galeries déjà valides.

**Migration** : aucune.

---

## 3. Pipeline d'upload média

**Fichiers modifiés** : `lib/upload-limits.ts` (nouveau), `app/admin/media-library.tsx`,
`app/api/admin/media/route.ts`.

**Problème initial** : la marge entre la cible de compression client
(640 Ko) et le plafond serveur (700 Ko) n'était que d'environ 9 %, alors que
l'environnement de production rejette les corps multipart proches de 1 Mio
**avant même que le code du Worker ne s'exécute** (donc sans réponse HTTP
exploitable côté client). Cette marge insuffisante, combinée à l'absence de
filet de sécurité indépendant du timeout XHR natif, correspond au bug
observé en production : upload bloqué à 100 % sans jamais se finaliser.

**A. Marges** (`lib/upload-limits.ts`, nouveau module partagé
client/serveur) : trois budgets nommés et documentés — `CLIENT_TARGET_BYTES`
(480 Ko), `SERVER_MAX_PART_BYTES` (600 Ko), `PLATFORM_HARD_LIMIT_BYTES`
(~1 Mio, documenté par l'équipe) — avec un contrôle exécutable
(`checkUploadLimits()`) qui échoue si les marges retenues (≥15 % entre
client et serveur, ≥25 % entre serveur et plateforme) ne sont pas
respectées. Testé dans `tests/upload-limits.test.ts`, qui démontre
explicitement que l'ancienne configuration (640 Ko/700 Ko) ne les
respectait pas.

**B. Compression client** (`app/admin/media-library.tsx`) : la boucle de
compression (`encodeWithinBudget`, ex-`make`) est désormais bornée
explicitement (`MAX_DIMENSION_ROUNDS = 8`) et nomme la variante en cause dans
son message d'erreur (« Impossible de compresser la variante « originale »
sous 480 Ko… ») plutôt que le message générique précédent. Le comportement
(réduction de qualité puis de dimension) est inchangé, seulement borné et
documenté.

**C. États UI** : le statut `"saving"` (« Enregistrement… ») a été ajouté,
distinct de `"processing"` (« Traitement… ») : il correspond précisément à
l'intervalle entre « tous les octets de la dernière partie ont été envoyés »
et « le serveur confirme l'écriture D1 » — c'est exactement la fenêtre où
l'upload restait auparavant affiché « à 100 % » sans jamais se conclure.

**D. Timeout** : `xhr()` ajoute un filet de sécurité (`UPLOAD_WATCHDOG_MS =
45000`) **indépendant** du `.timeout` natif du XHR : une minuterie manuelle
force l'abandon de la requête après 45 s même si le navigateur ou un
intermédiaire réseau ne déclenche jamais `onload`/`onerror`/`ontimeout` — le
scénario retenu comme cause probable du blocage silencieux observé en
production.

**E. Cohérence D1/R2** (`app/api/admin/media/route.ts`) :
- Le succès n'est désormais déclaré qu'après une lecture de vérification
  (`SELECT id FROM media WHERE id=? AND original_key IS NOT NULL`) confirmant
  que la ligne D1 est bien exploitable, pas seulement qu'un `.run()` n'a pas
  levé d'erreur.
- Nouvelle action `abort-upload` (même route, JSON, authentifiée) : si une
  séquence d'upload échoue après que certaines variantes ont déjà été
  stockées en R2, le client envoie désormais les clés déjà connues pour
  nettoyage best-effort, évitant des objets R2 orphelins jamais référencés
  par D1 (« médias fantômes »).
- Le nettoyage des anciens objets R2 lors d'un remplacement est désormais
  isolé dans son propre bloc : son échec ne transforme plus un remplacement
  déjà réussi et vérifié en échec signalé à l'admin (bug annexe corrigé au
  passage, voir `TEST_REPORT_PHASE1.md`).

**F. Logs** : instrumentation minimale par étape (`logStage`) — stade,
`uploadId`, variante, taille en octets — sans aucun contenu de fichier, nom
original ni e-mail, pour localiser rapidement où un échec se produit
(validation, R2, D1, réponse).

**Ce qui n'a pas été changé** : le format des variantes (thumbnail/mobile/
desktop/original), leur usage, le formulaire vidéo externe, la logique de
détection d'usage avant suppression — tout cela reste identique et n'a pas
été touché (hors périmètre de la Phase 1, voir `AUDIT_DIVINE_MOTION.md`
Phase 3).

**Résidu documenté** : un crash total du navigateur avant l'appel à
`abort-upload` (par ex. fermeture forcée de l'onglet en plein transfert)
reste un cas où un objet R2 intermédiaire peut rester orphelin ; ce n'est
pas résolu par la Phase 1 (nécessiterait un nettoyage périodique côté
plateforme, hors périmètre) et est documenté comme limite connue dans
`TEST_REPORT_PHASE1.md`.

**Impact** : marge réelle et vérifiée entre les trois budgets de taille ;
messages d'erreur explicites ; impossibilité de rester bloqué indéfiniment à
l'écran ; pas de succès déclaré sans vérification D1 ; nettoyage best-effort
des objets R2 orphelins.

**Migration** : aucune.

---

## 4. Frontière d'authentification admin

**Fichiers modifiés** : `lib/auth-allowlist.ts` (nouveau), `lib/admin-auth.ts`.
**Fichier ajouté** : `AUTH_TRUST_MODEL.md`.

**Problème initial** : toute l'autorisation admin repose sur la confiance
faite à l'en-tête `oai-authenticated-user-email`, injecté par la plateforme
d'hébergement. Le code lui-même était déjà correct (allowlist stricte,
échec fermé), mais cette dépendance totale n'était documentée nulle part, ce
qui rendait le niveau de risque réel invérifiable pour une revue externe.

**Ce qui a changé dans le code** :
- La logique de correspondance à `ADMIN_EMAILS` (normalisation, comparaison)
  a été extraite dans `lib/auth-allowlist.ts`, un module pur sans dépendance
  à `cloudflare:workers`/`next/headers`, désormais testable indépendamment
  (`tests/auth-allowlist.test.ts`).
- `lib/admin-auth.ts` journalise (log serveur, pas de table dédiée) chaque
  refus d'accès pour un utilisateur authentifié mais non autorisé — aide à
  détecter un sondage de `/admin` ou l'usage d'un compte retiré de la liste.
- Comportement fonctionnel **inchangé** : mêmes routes protégées, même
  critère d'autorisation, même échec fermé si `ADMIN_EMAILS` est vide.

**Ce qui a été documenté** (`AUTH_TRUST_MODEL.md`) : qui injecte l'en-tête,
pourquoi l'application lui fait confiance, l'inventaire vérifié de toutes les
routes qui en dépendent, le risque exact si l'en-tête devient falsifiable, et
la checklist de garanties à faire confirmer par la plateforme d'hébergement.
Conformément à la consigne de cette phase, **aucune cryptographie maison
n'a été ajoutée** : le document indique explicitement que la sécurité de
l'ensemble dépend, in fine, de la plateforme, et que ce n'est pas quelque
chose que le code applicatif peut prouver par lui-même.

**Impact** : aucun changement de comportement pour un utilisateur légitime
ou illégitime — mêmes décisions d'autorisation qu'avant, mais désormais
isolées, testées, et le modèle de confiance sous-jacent est explicite plutôt
qu'implicite.

**Migration** : aucune.

---

## Fichiers de configuration touchés

- `tsconfig.json` : ajout de `allowImportingTsExtensions: true` (déjà
  compatible avec `noEmit: true`, déjà actif) pour permettre aux nouveaux
  tests d'importer directement les modules `.ts` sans étape de build — ne
  change rien à la compilation ni au bundle applicatif (Vite/vinext résout
  ces imports indépendamment de `tsc`).
- `package.json` : ajout du script `test:unit` (lance les 4 nouveaux fichiers
  de test). Le script `test` existant n'est pas modifié.

## Nouveaux fichiers

- `lib/media-normalize.ts`, `lib/upload-limits.ts`, `lib/auth-allowlist.ts`
- `AUTH_TRUST_MODEL.md`
- `tests/media-normalize.test.ts`, `tests/auth-allowlist.test.ts`,
  `tests/upload-limits.test.ts`, `tests/schema-sql-consistency.test.ts`

## Hors périmètre (rappel volontaire)

Rate limiting, CAPTCHA, sitemap/robots/canonical, poids du bundle de
l'éditeur visuel, requêtes N+1, rôles complets, logos clair/sombre,
favicon dynamique, accessibilité des modales, cache/ISR : tous identifiés
dans `AUDIT_DIVINE_MOTION.md`, tous **volontairement non traités** ici,
comme demandé pour cette phase.
