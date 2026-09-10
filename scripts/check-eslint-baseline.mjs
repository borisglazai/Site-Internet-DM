#!/usr/bin/env node
/**
 * Lint ciblé : exécute ESLint uniquement sur les fichiers listés dans
 * scripts/lint-targeted-files.txt (les fichiers touchés par la Phase 1 et
 * par cette phase de portabilité), et échoue si le nombre d'erreurs ou
 * d'avertissements dépasse la référence connue
 * (scripts/eslint-baseline-count.json).
 *
 * Pourquoi un lint ciblé plutôt que `npm run lint` (tout le dépôt) comme
 * porte bloquante : le dépôt porte une dette ESLint préexistante bien plus
 * large (voir TEST_REPORT_PHASE1.md §6), sans rapport avec ces fichiers.
 * La bloquer romprait la CI sans permettre aucune contribution. `npm run
 * lint` reste exécuté en CI, mais de façon informative (non bloquante) —
 * voir .github/workflows/ci.yml.
 *
 * Si vous corrigez un avertissement/erreur préexistant dans un fichier
 * ciblé : mettez à jour scripts/eslint-baseline-count.json avec les
 * nouveaux totaux (ce script les indique dans son message).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const files = readFileSync(resolve(here, "lint-targeted-files.txt"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const baseline = JSON.parse(readFileSync(resolve(here, "eslint-baseline-count.json"), "utf8"));

let raw;
try {
  raw = execFileSync("npx", ["eslint", "--format", "json", ...files], { cwd: root, encoding: "utf8" });
} catch (error) {
  // ESLint exits 1 when it finds any error — its JSON output is still on stdout.
  raw = error.stdout ?? "[]";
}

const results = JSON.parse(raw);
let errors = 0;
let warnings = 0;
const details = [];
for (const file of results) {
  errors += file.errorCount;
  warnings += file.warningCount;
  for (const message of file.messages) {
    details.push(`  ${file.filePath}:${message.line}:${message.column} ${message.severity === 2 ? "error" : "warning"} ${message.message} (${message.ruleId})`);
  }
}

console.log(
  `[lint-targeted] ${errors} erreur(s) / ${warnings} avertissement(s) sur ${files.length} fichier(s), ` +
    `référence : ${baseline.errors} erreur(s) / ${baseline.warnings} avertissement(s).`,
);

if (errors > baseline.errors || warnings > baseline.warnings) {
  console.error("[lint-targeted] ÉCHEC : dette ESLint accrue sur les fichiers ciblés.");
  console.error(details.join("\n"));
  process.exit(1);
}

if (errors < baseline.errors || warnings < baseline.warnings) {
  console.log(
    `[lint-targeted] Dette réduite — pensez à mettre à jour scripts/eslint-baseline-count.json ` +
      `à {"errors": ${errors}, "warnings": ${warnings}}.`,
  );
}

console.log("[lint-targeted] OK — aucune dette ESLint supplémentaire sur les fichiers ciblés.");
