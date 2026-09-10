// Tests de lib/upload-limits.ts — correctif Phase 1 #3.A ("créer une marge
// réelle" entre la cible client, le plafond serveur et la limite plateforme).
// Ce test encode la marge minimale exigée comme une invariante exécutable :
// une régression future (un des trois nombres modifié sans les autres)
// échouera ici avant tout déploiement.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_TARGET_BYTES,
  SERVER_MAX_PART_BYTES,
  PLATFORM_HARD_LIMIT_BYTES,
  MIN_CLIENT_TO_SERVER_MARGIN_RATIO,
  MIN_SERVER_TO_PLATFORM_MARGIN_RATIO,
  checkUploadLimits,
} from "../lib/upload-limits.ts";

test("l'ordre des trois budgets est strictement croissant", () => {
  assert.ok(CLIENT_TARGET_BYTES < SERVER_MAX_PART_BYTES, "cible client < plafond serveur");
  assert.ok(SERVER_MAX_PART_BYTES < PLATFORM_HARD_LIMIT_BYTES, "plafond serveur < limite plateforme");
});

test("la marge client→serveur dépasse le minimum exigé", () => {
  const result = checkUploadLimits();
  assert.ok(
    result.clientToServerMarginRatio >= MIN_CLIENT_TO_SERVER_MARGIN_RATIO,
    `marge observée ${(result.clientToServerMarginRatio * 100).toFixed(1)}% < minimum ${(MIN_CLIENT_TO_SERVER_MARGIN_RATIO * 100).toFixed(0)}%`,
  );
});

test("la marge serveur→plateforme dépasse le minimum exigé", () => {
  const result = checkUploadLimits();
  assert.ok(
    result.serverToPlatformMarginRatio >= MIN_SERVER_TO_PLATFORM_MARGIN_RATIO,
    `marge observée ${(result.serverToPlatformMarginRatio * 100).toFixed(1)}% < minimum ${(MIN_SERVER_TO_PLATFORM_MARGIN_RATIO * 100).toFixed(0)}%`,
  );
});

test("checkUploadLimits() rapporte ok:true dans la configuration actuelle", () => {
  const result = checkUploadLimits();
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
});

test("régression historique : l'ancienne marge (640 Ko / 700 Ko, ~9%) aurait échoué", () => {
  // Ce test ne réévalue pas le code de production (les constantes sont
  // fixes) : il documente, en le recalculant, pourquoi l'ancienne
  // configuration ne satisfaisait pas le seuil retenu ici.
  const oldClientTarget = 640 * 1024;
  const oldServerMax = 700 * 1024;
  const oldMarginRatio = (oldServerMax - oldClientTarget) / oldServerMax;
  assert.ok(
    oldMarginRatio < MIN_CLIENT_TO_SERVER_MARGIN_RATIO,
    "l'ancienne marge de ~9% était bien sous le seuil minimal retenu pour la Phase 1",
  );
});
