// Fonction de normalisation partagée pour les listes de médias (galeries,
// chapitres, sections) stockées en JSON libre dans `cms_settings` ou dans les
// colonnes `*_json` de `projects`/`project_sections`.
//
// Ce JSON n'est jamais garanti par un schéma : il peut contenir `null`,
// `undefined`, une chaîne, un objet partiel ou toute autre valeur invalide
// (saisie manuelle, restauration d'un ancien instantané, bug amont). Toute
// page publique qui lit `entry.id` sans passer par cette fonction s'expose à
// un plantage de rendu (voir AUDIT_DIVINE_MOTION.md, correctif Phase 1 #2).
//
// Ce module ne dépend d'aucun framework (pas de "next/headers", pas de
// "cloudflare:workers") afin de rester testable directement avec le
// exécuteur de tests intégré de Node, sans base D1 ni environnement Worker.

export type NormalizedMediaEntry = {
  id: number;
  hidden: boolean;
  caption: string;
  alt: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPositiveId(value: unknown): number | null {
  const raw = isPlainObject(value) ? value.id : value;
  // Seuls un nombre ou une chaîne numérique désignent un id valide : un
  // booléen (`Number(true) === 1`) ou un tableau ne doivent pas être
  // silencieusement interprétés comme un média.
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

/**
 * Normalise une entrée de galerie/média potentiellement invalide.
 * Retourne `null` si l'entrée ne désigne aucun média exploitable
 * (null, undefined, tableau, objet sans id, chaîne non numérique, etc.).
 */
export function normalizeMediaEntry(value: unknown): NormalizedMediaEntry | null {
  const id = toPositiveId(value);
  if (id === null) return null;

  const source = isPlainObject(value) ? value : {};
  return {
    id,
    hidden: source.hidden === true,
    caption: typeof source.caption === "string" ? source.caption : "",
    alt: typeof source.alt === "string" ? source.alt : "",
  };
}

/**
 * Normalise une liste de médias (galerie, chapitre, section) issue d'un JSON
 * non fiable. Toute entrée invalide est silencieusement écartée plutôt que de
 * faire échouer le rendu.
 *
 * `includeHidden`:
 *  - `false` (défaut) : comportement du rendu public — les entrées marquées
 *    `hidden: true` sont retirées (comme `lib/public-cms.ts` le faisait déjà
 *    pour les galeries de projets).
 *  - `true` : comportement de l'éditeur/CMS — les entrées masquées sont
 *    conservées (avec leur indicateur `hidden`) pour que l'admin puisse les
 *    réafficher.
 */
export function normalizeMediaList(
  values: unknown,
  options: { includeHidden?: boolean } = {},
): NormalizedMediaEntry[] {
  if (!Array.isArray(values)) return [];

  const includeHidden = options.includeHidden ?? false;
  const normalized: NormalizedMediaEntry[] = [];
  for (const value of values) {
    const entry = normalizeMediaEntry(value);
    if (!entry) continue;
    if (!includeHidden && entry.hidden) continue;
    normalized.push(entry);
  }
  return normalized;
}

/**
 * Retourne une copie superficielle de `chapter` avec son champ `media`
 * normalisé (entrées invalides écartées). Ne modifie aucun autre champ :
 * pensé pour être appliqué à `work.chapters`, `project.sections`, etc.
 * juste avant le rendu, sans changer le reste du comportement existant.
 */
export function normalizeChapterMedia<T extends { media?: unknown }>(
  chapter: T,
  options: { includeHidden?: boolean } = {},
): Omit<T, "media"> & { media: NormalizedMediaEntry[] } {
  return { ...chapter, media: normalizeMediaList(chapter?.media, options) };
}
