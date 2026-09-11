// Extrait de app/visual-editor.tsx pour rester testable sans dépendre de
// React/JSX (voir tests/editor-panel-helpers.test.ts) — même logique,
// aucun changement de comportement.

const defaultSectionOrder = ["manifest", "gallery", "services", "featured", "film", "approach", "beyond", "final"];

export function sectionOrder(content: Record<string, unknown>): string[] {
  const stored = content.sectionOrder;
  return Array.isArray(stored) && stored.length ? [...stored] : [...defaultSectionOrder];
}

/**
 * Indique si "Monter"/"Descendre" doivent être désactivés pour la section
 * sélectionnée — première/dernière position dans sa collection réelle
 * (chapitres, services, équipe, ou l'ordre général des sections).
 */
export function sectionBounds(content: Record<string, unknown>, key: string): { atStart: boolean; atEnd: boolean } {
  if (key.startsWith("chapter:")) {
    const index = Number(key.split(":")[1]);
    const sections = content.sections;
    const length = Array.isArray(sections) ? sections.length : 0;
    return { atStart: index <= 0, atEnd: index >= length - 1 };
  }
  if (key.startsWith("service:") || key.startsWith("team:")) {
    const collection = content[key.startsWith("service:") ? "services" : "team"];
    const index = Number(key.split(":")[1]);
    const length = Array.isArray(collection) ? collection.length : 0;
    return { atStart: index <= 0, atEnd: index >= length - 1 };
  }
  const order = sectionOrder(content);
  const index = order.indexOf(key);
  return { atStart: index <= 0, atEnd: index === -1 || index >= order.length - 1 };
}
