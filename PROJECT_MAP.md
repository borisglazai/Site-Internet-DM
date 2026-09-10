# Carte du projet

```text
divine-motion-audit-package/
├── app/                         Pages, layouts, composants et Route Handlers
│   ├── admin/                   CMS client, médiathèque, gestion de projets
│   ├── api/                     API publiques et protégées
│   ├── projets/[slug]/          Page publique/d’édition d’un projet
│   ├── a-propos/                Page À propos
│   ├── contact/                 Page et formulaire de demande
│   ├── notre-travail/           Portfolio
│   ├── services/                Services
│   ├── visual-editor.tsx        Moteur client de l’éditeur visuel
│   ├── visual-editor.css        Styles des contrôles d’édition
│   ├── site-components.tsx      Header, navigation, footer, placeholders
│   ├── globals.css              Design system et styles publics
│   └── chatgpt-auth.ts          Lecture de l’identité de plateforme
├── lib/                         Accès CMS, auth, session et publication
│   ├── admin-auth.ts            Allowlist administrateurs
│   ├── cms-db.ts                Bindings D1/R2 et utilitaires SQL
│   ├── editor-page.ts           Assemblage page + brouillon + médias
│   ├── editor-session.ts        Cookie persistant du mode édition
│   ├── public-cms.ts            Lectures publiques et SEO
│   └── visual-editor.ts         Brouillon, publication, restauration
├── db/                          Déclarations Drizzle et connexion D1
├── drizzle/                     Migrations et snapshots du schéma
├── worker/                      Entrée Cloudflare Worker/Vinext
├── build/                       Plugin Vite spécifique à l’hébergement
├── scripts/                     Installation, build vérifié, environnement
├── tests/                       Test automatisé de rendu actuel
├── public/                      Logos, favicon, image Open Graph
├── examples/d1/                 Exemple de starter, non utilisé au runtime
├── .openai/hosting.json         Noms logiques des bindings et identifiant Site
├── package.json                 Scripts, versions et moteur Node
├── package-lock.json            Verrouillage exact des dépendances
├── vite.config.ts               Configuration Vinext/Vite/Cloudflare
├── next.config.ts               Configuration Next.js
├── drizzle.config.ts            Configuration de génération SQL
├── tsconfig.json                TypeScript
├── .env.example                 Variables requises sans secret
└── *_AUDIT / *_MODEL / *_API    Documentation de reprise
```

## Flux principaux

- Public : page App Router → `lib/public-cms.ts` → D1 → rendu React ; médias via `/api/media/[id]` → R2.
- CMS : `/admin` → composants client → `/api/admin/cms` ou `/api/admin/media` → D1/R2 + `audit_log`.
- Éditeur : page publique → `editorPage()`/`getEditorState()` → `VisualEditor` → `/api/admin/visual-editor` → brouillon/publication D1.
- Contact : `InquiryForm` → `POST /api/inquiries` → table `inquiries` → écran Demandes du CMS.

Les artefacts `node_modules`, `.next`, `dist`, caches, journaux Wrangler et dépôt `.git` ne font pas partie de l’archive.

