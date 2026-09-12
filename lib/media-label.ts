// Libellé contextuel affiché dans le panneau média du visual editor, dérivé
// du chemin `data-media-key` déjà présent dans le rendu partagé — aucune
// modification des pages n'est nécessaire pour en bénéficier. Extrait dans
// son propre fichier pour rester testable sans dépendre de React/JSX (voir
// tests/editor-panel-helpers.test.ts).
export function mediaLabel(key: string, types: string[] = []): string {
  const isVideo = types.includes("video") || types.includes("external_video");
  if (key === "heroMediaId") return isVideo ? "Vidéo hero" : "Image hero";
  if (key.startsWith("gallery.") || key.startsWith("urbanGallery.")) return "Galerie principale";
  if (key === "coverMediaId" || key === "storyCoverMediaId") return "Image de couverture";
  if (key.startsWith("team.")) return "Portrait";
  if (key === "mainMediaId") return "Image principale";
  if (key === "filmMediaId" || key.endsWith(".mediaId")) return "Vidéo";
  if (key.startsWith("chapters.") || key.startsWith("sections.")) return "Photo de chapitre";
  if (key.startsWith("customSections.")) return "Média de section";
  return "Média sélectionné";
}

/**
 * Calcule la cible média du hero (clé, types, champ alt) à partir du seul
 * contenu de la page — sans dépendre d'un élément DOM cliqué. Utilisé par le
 * bouton de raccourci du panneau section ("Ajouter/gérer le média du hero")
 * pour rester accessible même quand le hero n'a pas encore de média, ou
 * quand un élément visuel (l'overlay du hero) intercepte le clic direct sur
 * la zone média (voir l'audit Phase UX 2 bis, point 1).
 */
export function heroMediaTarget(content: Record<string, unknown>): { key: string; types: string[]; altKey?: string } {
  const isVideo = content.heroType === "video";
  return { key: "heroMediaId", types: isVideo ? ["video", "external_video"] : ["image"], altKey: isVideo ? undefined : "heroMediaAlt" };
}
