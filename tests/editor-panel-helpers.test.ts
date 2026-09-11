import assert from "node:assert/strict";
import test from "node:test";
import { mediaLabel } from "../lib/media-label.ts";
import { sectionBounds, sectionOrder } from "../lib/section-order.ts";

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
