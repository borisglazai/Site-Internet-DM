# Dépendances

## Production

| Dépendance | Version | Rôle | Criticité |
|---|---:|---|---|
| `next` | 16.2.6 | App Router, rendu serveur, routes API, métadonnées | Critique |
| `react` | 19.2.6 | Composants et état UI | Critique |
| `react-dom` | 19.2.6 | Rendu React DOM | Critique |
| `drizzle-orm` | 0.45.2 | Déclaration typée du schéma et accès D1 dans `db/index.ts` | Importante ; le CMS utilise surtout SQL direct |

## Développement, build et plateforme

| Dépendance | Version | Rôle | Criticité |
|---|---:|---|---|
| `vinext` | 0.0.50 | Adaptation Next.js vers Vite/Cloudflare Worker | Critique |
| `vite` | 8.0.13 | Build et serveur de développement | Critique |
| `wrangler` | 4.92.0 | Environnement Cloudflare local/build | Critique pour la cible actuelle |
| `@cloudflare/vite-plugin` | 1.37.1 | Intégration Vite/Workers | Critique |
| `@vitejs/plugin-react` | 6.0.2 | Transformation React | Critique build |
| `@vitejs/plugin-rsc` | 0.5.26 | React Server Components avec Vite | Critique build |
| `react-server-dom-webpack` | 19.2.6 | Protocole RSC | Critique build |
| `typescript` | 5.9.3 | Vérification et compilation TS | Critique développement |
| `drizzle-kit` | 0.31.10 | Génération des migrations | Critique lors d’évolution D1 |
| `tailwindcss` | 4.2.1 | Chaîne CSS disponible | Secondaire ; styles largement personnalisés |
| `@tailwindcss/postcss` | 4.2.1 | Traitement Tailwind/PostCSS | Secondaire |
| `eslint` | 9.39.4 | Analyse statique | Recommandée |
| `eslint-config-next` | 16.2.6 | Règles Next.js | Recommandée |
| `@types/node` | 22.19.19 | Types Node.js | Développement |
| `@types/react` | 19.2.14 | Types React | Développement |
| `@types/react-dom` | 19.2.3 | Types React DOM | Développement |

Le fichier `package-lock.json` doit être conservé pour reproduire l’arbre exact. Node.js `>=22.13.0` est exigé. Aucun SDK tiers d’email, paiement, analytics ou stockage externe n’est déclaré.

