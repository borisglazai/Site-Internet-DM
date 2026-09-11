import assert from "node:assert/strict";
import test from "node:test";
import { mediaLabel } from "../lib/media-label.ts";
import { sectionBounds, sectionOrder, sectionLabel } from "../lib/section-order.ts";

test("mediaLabel() donne un libellé contextuel selon la zone", () => {
  assert.equal(mediaLabel("heroMediaId"), "Image hero");
  assert.equal(mediaLabel("gallery.0.id"), "Galerie principale");
  assert.equal(mediaLabel("urbanGallery.1.id"), "Galerie principale");
  assert.equal(mediaLabel("coverMediaId"), "Image de couverture");
  assert.equal(mediaLabel("team.2.photoMediaId"), "Portrait");
  assert.equal(mediaLabel("mainMediaId"), "Image principale");
  assert.equal(mediaLabel("chapters.0.media.1.id"), "Photo de chapitre");
  assert.equal(mediaLabel("customSections.0.mediaIds.0"), "Média de section");
  assert.equal(mediaLabel("une-clef-inconnue"), "Média sélectionné");
});

test("mediaLabel() distingue Image hero et Vidéo hero selon les types déclarés", () => {
  assert.equal(mediaLabel("heroMediaId", ["image"]), "Image hero");
  assert.equal(mediaLabel("heroMediaId", ["video", "external_video"]), "Vidéo hero");
  assert.equal(mediaLabel("heroMediaId"), "Image hero", "sans types, on reste sur le libellé image par défaut");
});

test("sectionLabel() donne un titre de panneau contextuel et lisible", () => {
  assert.equal(sectionLabel("hero"), "Hero");
  assert.equal(sectionLabel("services"), "Services");
  assert.equal(sectionLabel("chapter:0"), "Chapitre 1");
  assert.equal(sectionLabel("chapter:3"), "Chapitre 4");
  assert.equal(sectionLabel("service:0"), "Service");
  assert.equal(sectionLabel("team:0"), "Membre de l’équipe");
  assert.equal(sectionLabel("custom:abc-123"), "Section personnalisée");
  assert.equal(sectionLabel("une-clef-inconnue"), "Section");
});

test("sectionOrder() retombe sur l'ordre par défaut si absent", () => {
  assert.deepEqual(sectionOrder({}), ["manifest", "gallery", "services", "featured", "film", "approach", "beyond", "final"]);
  assert.deepEqual(sectionOrder({ sectionOrder: ["a", "b"] }), ["a", "b"]);
});

test("sectionBounds() désactive Monter en première position et Descendre en dernière", () => {
  const content = { sections: [{}, {}, {}] };
  assert.deepEqual(sectionBounds(content, "chapter:0"), { atStart: true, atEnd: false });
  assert.deepEqual(sectionBounds(content, "chapter:1"), { atStart: false, atEnd: false });
  assert.deepEqual(sectionBounds(content, "chapter:2"), { atStart: false, atEnd: true });
});

test("sectionBounds() fonctionne pour services/équipe et l'ordre général", () => {
  assert.deepEqual(sectionBounds({ services: [{}, {}] }, "service:0"), { atStart: true, atEnd: false });
  assert.deepEqual(sectionBounds({ services: [{}, {}] }, "service:1"), { atStart: false, atEnd: true });
  assert.deepEqual(sectionBounds({ team: [{}] }, "team:0"), { atStart: true, atEnd: true });
  const order = { sectionOrder: ["manifest", "gallery", "final"] };
  assert.deepEqual(sectionBounds(order, "manifest"), { atStart: true, atEnd: false });
  assert.deepEqual(sectionBounds(order, "gallery"), { atStart: false, atEnd: false });
  assert.deepEqual(sectionBounds(order, "final"), { atStart: false, atEnd: true });
});
