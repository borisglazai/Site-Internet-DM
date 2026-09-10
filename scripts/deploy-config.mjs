#!/usr/bin/env node
/**
 * Prépare une configuration Wrangler déployable à partir de celle générée
 * par `vinext build` (dist/server/wrangler.json).
 *
 * Pourquoi ce script plutôt qu'un wrangler.jsonc écrit à la main :
 * `vinext build` produit déjà un wrangler.json complet et correct
 * (compatibility_date, règles ESM, dossier d'assets) — mais avec des
 * identifiants D1/R2 placeholder (ceux utilisés pour la simulation locale,
 * voir vite.config.ts). Dupliquer ce fichier à la main créerait un second
 * exemplaire à resynchroniser à chaque mise à jour de `vinext`. Ce script se
 * contente de remplacer les champs qui DOIVENT changer par environnement
 * (nom du Worker, ressources D1/R2, route), en conservant tout le reste tel
 * que vinext l'a généré.
 *
 * Usage :
 *   node scripts/deploy-config.mjs
 *
 * Variables d'environnement requises (voir ENVIRONMENTS.md) :
 *   CF_WORKER_NAME          nom du Worker Cloudflare pour cet environnement
 *   CF_D1_DATABASE_NAME     nom de la base D1 réelle
 *   CF_D1_DATABASE_ID       UUID de la base D1 réelle (`wrangler d1 create`)
 *   CF_R2_BUCKET_NAME       nom du bucket R2 réel
 * Optionnelles :
 *   CF_ROUTE_PATTERN        nom d'hôte pour un domaine personnalisé Cloudflare
 *                           ("Custom Domain"), ex. "staging.divine-motion.example".
 *                           Un Custom Domain n'accepte ni chemin ni caractère
 *                           générique (validé par `wrangler deploy --dry-run`).
 *   CF_ENABLE_IMAGES        "1" pour déclarer la liaison Cloudflare Images
 *                           (binding IMAGES). Laissé désactivé par défaut :
 *                           le code se dégrade proprement (image d'origine
 *                           servie telle quelle) si cette liaison est
 *                           absente — voir PORTABILITY_AUDIT.md #13.
 *
 * Ce script ne déploie rien lui-même. Il écrit
 * dist/server/wrangler.deploy.json, à utiliser ensuite avec :
 *   npx wrangler deploy --config dist/server/wrangler.deploy.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_VARS = ["CF_WORKER_NAME", "CF_D1_DATABASE_NAME", "CF_D1_DATABASE_ID", "CF_R2_BUCKET_NAME"];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[deploy-config] Variable d'environnement manquante : ${name}`);
    console.error("[deploy-config] Voir ENVIRONMENTS.md pour la liste complète et leur origine par environnement.");
    process.exit(1);
  }
  return value;
}

async function main() {
  for (const name of REQUIRED_VARS) requireEnv(name);

  const sourcePath = resolve(process.cwd(), "dist/server/wrangler.json");
  const destPath = resolve(process.cwd(), "dist/server/wrangler.deploy.json");

  let raw;
  try {
    raw = await readFile(sourcePath, "utf8");
  } catch {
    console.error(`[deploy-config] ${sourcePath} introuvable. Lancez d'abord "npm run build".`);
    process.exit(1);
  }

  const config = JSON.parse(raw);

  config.name = requireEnv("CF_WORKER_NAME");
  config.d1_databases = [
    {
      binding: "DB",
      database_name: requireEnv("CF_D1_DATABASE_NAME"),
      database_id: requireEnv("CF_D1_DATABASE_ID"),
    },
  ];
  config.r2_buckets = [
    {
      binding: "BUCKET",
      bucket_name: requireEnv("CF_R2_BUCKET_NAME"),
    },
  ];

  if (process.env.CF_ROUTE_PATTERN) {
    config.routes = [{ pattern: process.env.CF_ROUTE_PATTERN, custom_domain: true }];
  }

  if (process.env.CF_ENABLE_IMAGES === "1") {
    config.images = { binding: "IMAGES" };
  }

  // ADMIN_EMAILS et tout autre secret ne passent jamais par ce fichier :
  // ils se configurent avec `wrangler secret put ADMIN_EMAILS --config <ce fichier>`
  // (voir DEPLOYMENT_OUTSIDE_SITES.md). `vars` reste vide intentionnellement.

  await writeFile(destPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`[deploy-config] Écrit ${destPath}`);
  console.log(`[deploy-config] Worker: ${config.name} | D1: ${config.d1_databases[0].database_name} | R2: ${config.r2_buckets[0].bucket_name}`);
  if (config.routes) console.log(`[deploy-config] Route: ${config.routes[0].pattern}`);
}

main();
