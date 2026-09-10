#!/usr/bin/env node
/**
 * Exécute `tsc --noEmit` et échoue uniquement si le nombre d'erreurs a
 * augmenté par rapport à la référence connue (scripts/typescript-baseline-count.txt).
 *
 * Pourquoi : au moment d'écrire ce script, le dépôt contient 14 erreurs
 * TypeScript préexistantes, sans rapport avec la portabilité (voir
 * TEST_REPORT_PHASE1.md §6 et PORTABILITY_AUDIT.md). Faire échouer la CI sur
 * ces erreurs bloquerait toute contribution sans rapport avec elles. Ce
 * script laisse passer la dette connue, tout en interdisant d'en ajouter.
 *
 * Si vous corrigez une erreur préexistante : mettez à jour
 * scripts/typescript-baseline-count.txt avec le nouveau total (ce script
 * l'indique dans son message).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const baselinePath = resolve(here, "typescript-baseline-count.txt");
const baseline = Number(readFileSync(baselinePath, "utf8").trim());

let output = "";
try {
  execSync("npx tsc --noEmit -p tsconfig.json", { cwd: resolve(here, ".."), encoding: "utf8" });
} catch (error) {
  output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

const errorLines = output.split("\n").filter((line) => /error TS\d+:/.test(line));
const count = errorLines.length;

console.log(`[typescript-baseline] ${count} erreur(s) TypeScript trouvée(s), référence : ${baseline}.`);

if (count > baseline) {
  console.error(`[typescript-baseline] ÉCHEC : ${count - baseline} nouvelle(s) erreur(s) introduite(s).`);
  console.error("[typescript-baseline] Nouvelles erreurs (au-delà de la référence) :");
  for (const line of errorLines) console.error(`  ${line}`);
  process.exit(1);
}

if (count < baseline) {
  console.log(
    `[typescript-baseline] ${baseline - count} erreur(s) préexistante(s) corrigée(s) — ` +
      `pensez à mettre à jour scripts/typescript-baseline-count.txt à ${count}.`,
  );
}

console.log("[typescript-baseline] OK — aucune nouvelle erreur.");
