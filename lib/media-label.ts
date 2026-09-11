// Libellé contextuel affiché dans le panneau média du visual editor, dérivé
// du chemin `data-media-key` déjà présent dans le rendu partagé — aucune
// modification des pages n'est nécessaire pour en bénéficier. Extrait dans
// son propre fichier pour rester testable sans dépendre de React/JSX (voir
// tests/editor-panel-helpers.test.ts).
export function mediaLabel(key: string): string {
  if (key === "heroMediaId") return "Image hero";
  if (key.startsWith("gallery.") || key.startsWith("urbanGallery.")) return "Galerie principale";
  if (key === "coverMediaId" || key === "storyCoverMediaId") return "Image de couverture";
  if (key.startsWith("team.")) return "Portrait";
  if (key === "mainMediaId") return "Image principale";
  if (key === "filmMediaId" || key.endsWith(".mediaId")) return "Vidéo";
  if (key.startsWith("chapters.") || key.startsWith("sections.")) return "Photo de chapitre";
  if (key.startsWith("customSections.")) return "Média de section";
  return "Média sélectionné";
}
