// Budgets de taille partagés entre le client (compression des variantes
// d'image dans app/admin/media-library.tsx) et le serveur
// (app/api/admin/media/route.ts).
//
// L'audit (AUDIT_DIVINE_MOTION.md, risque #3) a établi que la marge réelle
// entre la cible client (640 Ko) et le plafond serveur (700 Ko) n'était que
// de 60 Ko (~9 %) — une marge insuffisante pour absorber l'imprécision de la
// compression WebP et l'overhead multipart, sur un environnement dont on
// sait par ailleurs qu'il rejette les corps multipart proches de 1 Mio
// *avant même que le code du Worker ne s'exécute* (donc sans réponse HTTP
// exploitable côté client).
//
// Ce module fixe deux marges explicites et indépendantes :
//   1. entre la cible de compression client et le plafond serveur ;
//   2. entre le plafond serveur et la limite de la plateforme.
// `assertUploadLimitsAreSafe()` vérifie ces marges au chargement du module et
// est aussi exercée par un test automatisé (tests/upload-limits.test.ts) afin
// qu'une régression future (un des trois nombres modifié sans les autres)
// soit détectée avant déploiement plutôt qu'en production.

/** Limite approximative, côté plateforme, avant que le Worker ne s'exécute. */
export const PLATFORM_HARD_LIMIT_BYTES = 1024 * 1024; // ~1 Mio, documenté par l'équipe produit.

/** Taille maximale acceptée par le serveur pour une seule partie multipart. */
export const SERVER_MAX_PART_BYTES = 600 * 1024;

/** Taille visée par la compression client pour chaque variante d'image. */
export const CLIENT_TARGET_BYTES = 480 * 1024;

/** Marge minimale exigée entre la cible client et le plafond serveur. */
export const MIN_CLIENT_TO_SERVER_MARGIN_RATIO = 0.15;

/** Marge minimale exigée entre le plafond serveur et la limite plateforme. */
export const MIN_SERVER_TO_PLATFORM_MARGIN_RATIO = 0.25;

export type UploadLimitsCheck = {
  ok: boolean;
  clientToServerMarginRatio: number;
  serverToPlatformMarginRatio: number;
  issues: string[];
};

/**
 * Vérifie que les trois constantes ci-dessus conservent une marge réelle
 * entre elles. Pure fonction (aucun accès réseau/fichier) afin de rester
 * testable indépendamment de tout environnement Cloudflare.
 */
export function checkUploadLimits(): UploadLimitsCheck {
  const issues: string[] = [];

  const clientToServerMarginRatio =
    (SERVER_MAX_PART_BYTES - CLIENT_TARGET_BYTES) / SERVER_MAX_PART_BYTES;
  const serverToPlatformMarginRatio =
    (PLATFORM_HARD_LIMIT_BYTES - SERVER_MAX_PART_BYTES) / PLATFORM_HARD_LIMIT_BYTES;

  if (!(CLIENT_TARGET_BYTES < SERVER_MAX_PART_BYTES)) {
    issues.push("CLIENT_TARGET_BYTES doit rester strictement inférieur à SERVER_MAX_PART_BYTES.");
  }
  if (!(SERVER_MAX_PART_BYTES < PLATFORM_HARD_LIMIT_BYTES)) {
    issues.push("SERVER_MAX_PART_BYTES doit rester strictement inférieur à PLATFORM_HARD_LIMIT_BYTES.");
  }
  if (clientToServerMarginRatio < MIN_CLIENT_TO_SERVER_MARGIN_RATIO) {
    issues.push(
      `Marge client→serveur insuffisante (${(clientToServerMarginRatio * 100).toFixed(1)}% < ${(MIN_CLIENT_TO_SERVER_MARGIN_RATIO * 100).toFixed(0)}%).`,
    );
  }
  if (serverToPlatformMarginRatio < MIN_SERVER_TO_PLATFORM_MARGIN_RATIO) {
    issues.push(
      `Marge serveur→plateforme insuffisante (${(serverToPlatformMarginRatio * 100).toFixed(1)}% < ${(MIN_SERVER_TO_PLATFORM_MARGIN_RATIO * 100).toFixed(0)}%).`,
    );
  }

  return { ok: issues.length === 0, clientToServerMarginRatio, serverToPlatformMarginRatio, issues };
}
