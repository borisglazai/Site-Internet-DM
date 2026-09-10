// Garde-fou statique pour le correctif Phase 1 #1 (écart de schéma SQL).
//
// Plutôt que de dépendre d'une base D1 réelle (non disponible dans cet
// environnement de test, voir TEST_REPORT_PHASE1.md), ce test analyse le
// TEXTE SOURCE de db/schema.ts et lib/visual-editor.ts pour vérifier
// automatiquement qu'aucune requête UPDATE de la publication visuelle ne
// référence une colonne absente du schéma déclaré. C'est exactement la classe
// de bug identifiée par l'audit (services.updated_by / team_members.updated_by
// inexistantes) : ce test échoue si elle est réintroduite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaSource = readFileSync(resolve(here, "../db/schema.ts"), "utf8");
const visualEditorSource = collapseConcatenatedStrings(readFileSync(resolve(here, "../lib/visual-editor.ts"), "utf8"));

/** Recolle les littéraux de chaîne SQL coupés sur plusieurs lignes (`"..." + "..."`). */
function collapseConcatenatedStrings(source: string): string {
  return source.replace(/"\s*\+\s*"/g, "");
}

function extractColumnNames(body: string): Set<string> {
  const columns = new Set<string>();
  const columnRegex = /(?:text|integer)\(\s*"([a-zA-Z0-9_]+)"/g;
  let columnMatch: RegExpExecArray | null;
  while ((columnMatch = columnRegex.exec(body))) columns.add(columnMatch[1]);
  return columns;
}

function extractSchemaColumns(source: string): Map<string, Set<string>> {
  // `created_at`/`updated_at` sont factorisées dans `const timestamps={...}`
  // et injectées via `...timestamps` : ces deux colonnes n'apparaissent donc
  // pas littéralement dans le corps de chaque `sqliteTable(...)`. On les
  // extrait une fois séparément puis on les ajoute à toute table qui les
  // spread, plutôt que de les coder en dur (si `timestamps` est renommé ou
  // ses colonnes changées, ce test suit automatiquement).
  const timestampsMatch = source.match(/const\s+timestamps\s*=\s*\{([\s\S]*?)\}\s*;/);
  const timestampsColumns = timestampsMatch ? extractColumnNames(timestampsMatch[1]) : new Set<string>();

  const tables = new Map<string, Set<string>>();
  const tableRegex = /sqliteTable\(\s*"([a-z_]+)"\s*,\s*\{([\s\S]*?)\}\s*\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(source))) {
    const [, tableName, body] = match;
    const columns = extractColumnNames(body);
    if (body.includes("...timestamps")) for (const column of timestampsColumns) columns.add(column);
    tables.set(tableName, columns);
  }
  return tables;
}

/** Colonnes référencées par chaque `UPDATE <table> SET ... WHERE` du fichier. */
function extractUpdateSetColumns(source: string, table: string): string[][] {
  const statements: string[][] = [];
  const updateRegex = new RegExp(`UPDATE\\s+${table}\\s+SET\\s+([\\s\\S]*?)\\s+WHERE`, "g");
  let match: RegExpExecArray | null;
  while ((match = updateRegex.exec(source))) {
    const columns = match[1]
      .split(",")
      .map((part) => part.trim().split("=")[0].trim())
      .filter(Boolean);
    statements.push(columns);
  }
  return statements;
}

const schemaTables = extractSchemaColumns(schemaSource);

test("le parseur du schéma trouve bien les tables attendues", () => {
  // Garde-fou du test lui-même : si ce nombre change, le parseur a un
  // problème (ou le schéma a évolué et ce test doit être mis à jour).
  const expected = [
    "cms_settings",
    "projects",
    "project_sections",
    "media",
    "services",
    "team_members",
    "inquiries",
    "admin_users",
    "inquiry_notes",
    "audit_log",
  ];
  for (const table of expected) {
    assert.ok(schemaTables.has(table), `table "${table}" non trouvée par le parseur — vérifier db/schema.ts`);
  }
});

// `cms_settings` n'est jamais écrite via un `UPDATE ... SET` littéral dans ce
// fichier (toujours via `INSERT ... ON CONFLICT DO UPDATE SET`, factorisé
// dans `upsertSettingSql`) : elle est couverte séparément ci-dessous plutôt
// que par la boucle UPDATE générique.
for (const table of ["services", "team_members", "projects"]) {
  test(`toutes les colonnes écrites par lib/visual-editor.ts dans "${table}" existent dans db/schema.ts`, () => {
    const columns = schemaTables.get(table);
    assert.ok(columns && columns.size > 0, `table "${table}" absente ou vide dans le schéma parsé`);

    const statements = extractUpdateSetColumns(visualEditorSource, table);
    assert.ok(statements.length > 0, `aucune requête UPDATE ${table} trouvée dans lib/visual-editor.ts — le test ne couvre plus rien`);

    for (const statementColumns of statements) {
      for (const column of statementColumns) {
        assert.ok(
          columns!.has(column),
          `colonne "${column}" référencée par une requête UPDATE ${table} dans lib/visual-editor.ts ` +
            `mais absente de db/schema.ts — c'est exactement le bug corrigé en Phase 1.`,
        );
      }
    }
  });
}

test("l'upsert partagé de cms_settings ne référence que des colonnes réelles", () => {
  const columns = schemaTables.get("cms_settings");
  assert.ok(columns && columns.size > 0);
  const upsertMatch = visualEditorSource.match(/const upsertSettingSql\s*=\s*([\s\S]*?);/);
  assert.ok(upsertMatch, "constante upsertSettingSql introuvable — a-t-elle été renommée ?");
  for (const column of ["key", "value", "updated_by", "updated_at"]) {
    assert.ok(columns!.has(column), `colonne "${column}" absente de cms_settings dans db/schema.ts`);
    assert.ok(upsertMatch![1].includes(column), `colonne "${column}" attendue dans upsertSettingSql`);
  }
});

test("régression : `updated_by` n'est plus écrit sur services/team_members (bug corrigé)", () => {
  for (const columns of extractUpdateSetColumns(visualEditorSource, "services")) {
    assert.ok(!columns.includes("updated_by"), "services n'a pas de colonne updated_by (voir CHANGELOG_PHASE1.md)");
  }
  for (const columns of extractUpdateSetColumns(visualEditorSource, "team_members")) {
    assert.ok(!columns.includes("updated_by"), "team_members n'a pas de colonne updated_by (voir CHANGELOG_PHASE1.md)");
  }
});
