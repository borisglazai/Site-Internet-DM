// Tests de lib/media-normalize.ts — correctif Phase 1 #2 (crash null sur
// /notre-travail). Exécutable directement avec `node --test` (Node >=22.6
// exécute les .ts avec érasure de types, sans étape de build) : aucune
// dépendance à Next.js, Cloudflare ou D1.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaEntry, normalizeMediaList, normalizeChapterMedia } from "../lib/media-normalize.ts";

test("normalizeMediaEntry: tolère null et undefined", () => {
  assert.equal(normalizeMediaEntry(null), null);
  assert.equal(normalizeMediaEntry(undefined), null);
});

test("normalizeMediaEntry: tolère une chaîne", () => {
  assert.deepEqual(normalizeMediaEntry("42"), { id: 42, hidden: false, caption: "", alt: "" });
  assert.equal(normalizeMediaEntry("not-a-number"), null);
});

test("normalizeMediaEntry: accepte un id numérique brut", () => {
  assert.deepEqual(normalizeMediaEntry(7), { id: 7, hidden: false, caption: "", alt: "" });
  assert.equal(normalizeMediaEntry(0), null, "un id 0/négatif n'est pas un média valide");
  assert.equal(normalizeMediaEntry(-3), null);
});

test("normalizeMediaEntry: objet média valide", () => {
  assert.deepEqual(normalizeMediaEntry({ id: 5, alt: "Portrait", caption: "Légende", hidden: true }), {
    id: 5,
    hidden: true,
    caption: "Légende",
    alt: "Portrait",
  });
});

test("normalizeMediaEntry: objet partiel (sans alt/caption)", () => {
  assert.deepEqual(normalizeMediaEntry({ id: 9 }), { id: 9, hidden: false, caption: "", alt: "" });
});

test("normalizeMediaEntry: objet sans id est invalide", () => {
  assert.equal(normalizeMediaEntry({ alt: "sans id" }), null);
});

test("normalizeMediaEntry: entrée invalide (tableau, booléen)", () => {
  assert.equal(normalizeMediaEntry([1, 2, 3]), null);
  assert.equal(normalizeMediaEntry(true), null);
});

test("normalizeMediaList: tolère une valeur non-tableau", () => {
  assert.deepEqual(normalizeMediaList(null), []);
  assert.deepEqual(normalizeMediaList(undefined), []);
  assert.deepEqual(normalizeMediaList("oops"), []);
  assert.deepEqual(normalizeMediaList({ id: 1 }), []);
});

test("normalizeMediaList: filtre les entrées null/undefined/invalides sans planter", () => {
  const result = normalizeMediaList([null, { id: 5, alt: "A" }, undefined, "not-an-id", { id: 8 }]);
  assert.deepEqual(
    result.map((entry) => entry.id),
    [5, 8],
  );
});

test("normalizeMediaList: includeHidden=false (rendu public) retire les entrées masquées", () => {
  const result = normalizeMediaList([{ id: 1, hidden: true }, { id: 2, hidden: false }]);
  assert.deepEqual(result.map((entry) => entry.id), [2]);
});

test("normalizeMediaList: includeHidden=true (éditeur/CMS) conserve les entrées masquées", () => {
  const result = normalizeMediaList([{ id: 1, hidden: true }, { id: 2, hidden: false }], { includeHidden: true });
  assert.deepEqual(result.map((entry) => entry.id), [1, 2]);
});

test("normalizeChapterMedia: reproduit exactement le crash historique sans planter", () => {
  // Reproduction du cas réel rapporté : un chapitre de /notre-travail dont le
  // tableau `media` contient une entrée `null` (ex. après une suppression
  // partielle depuis l'éditeur, ou une restauration d'un ancien brouillon).
  const chapter = { title: "Les préparatifs", text: "…", media: [null, { id: 3, alt: "Détail" }, undefined] };
  assert.doesNotThrow(() => normalizeChapterMedia(chapter, { includeHidden: true }));
  const normalized = normalizeChapterMedia(chapter, { includeHidden: true });
  assert.deepEqual(normalized.media.map((entry) => entry.id), [3]);
  assert.equal(normalized.title, "Les préparatifs", "les autres champs du chapitre restent inchangés");
});

test("normalizeChapterMedia: un chapitre sans champ media ne plante pas", () => {
  const chapter = { title: "Sans médias" };
  const normalized = normalizeChapterMedia(chapter as any, { includeHidden: true });
  assert.deepEqual(normalized.media, []);
});
