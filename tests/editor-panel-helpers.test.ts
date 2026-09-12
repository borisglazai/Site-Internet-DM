import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mediaLabel, heroMediaTarget } from "../lib/media-label.ts";
import { sectionBounds, sectionOrder, sectionLabel } from "../lib/section-order.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

test("heroMediaTarget() calcule la cible média du hero sans dépendre d'un élément DOM", () => {
  // Le bouton de raccourci "Ajouter/gérer le média du hero" dans le panneau
  // section repose sur cette fonction pour rester accessible même quand le
  // hero n'a pas encore de média — voir l'audit Phase UX 2 bis, point 1.
  assert.deepEqual(heroMediaTarget({ heroType: "image" }), { key: "heroMediaId", types: ["image"], altKey: "heroMediaAlt" });
  assert.deepEqual(heroMediaTarget({ heroType: "video" }), { key: "heroMediaId", types: ["video", "external_video"], altKey: undefined });
  assert.deepEqual(heroMediaTarget({}), { key: "heroMediaId", types: ["image"], altKey: "heroMediaAlt" }, "sans heroType, on suppose une image");
});

test("régression : l'overlay du hero (.hero-shade) ne doit jamais intercepter les clics", () => {
  // Root cause du bug « pas d'action d'ajout visible sur un hero vide » :
  // .hero-shade est un calque décoratif positionné par-dessus .hero-media
  // (même zone, plus tard dans le DOM) ; sans pointer-events:none, un clic
  // sur le hero atterrit sur ce calque au lieu du média, et remonte donc au
  // <section data-section-key="hero">, jamais au data-media-key. Ce test
  // échoue si le correctif CSS disparaît (voir app/globals.css).
  const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
  const match = css.match(/\.hero-shade\{[^}]*\}/);
  assert.ok(match, ".hero-shade doit exister dans app/globals.css");
  assert.ok(match[0].includes("pointer-events:none"), ".hero-shade doit avoir pointer-events:none pour laisser passer les clics vers .hero-media");
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
