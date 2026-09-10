// Vérification côté serveur des requêtes protégées par Cloudflare Access.
//
// Cloudflare Access pose un en-tête `Cf-Access-Jwt-Assertion` sur toute
// requête qui a passé sa politique d'authentification, contenant un JWT
// signé (RS256) par l'équipe Zero Trust. Ce module vérifie réellement cette
// signature contre les clés publiques de l'équipe (JWKS), plutôt que de
// faire confiance à un en-tête déclaratif — c'est précisément ce que
// AUTH_MIGRATION_PLAN.md et AUTH_TRUST_MODEL.md identifiaient comme
// l'amélioration de sécurité principale par rapport à SIWC (voir
// `oai-authenticated-user-email`, qui lui n'est vérifiable par aucun moyen
// cryptographique côté application).
//
// Conçu pour être testable sans réseau : `jwks` est injectable (voir
// tests/cloudflare-access.test.ts, qui signe un vrai JWT avec une paire de
// clés locale et vérifie module contre elle). En production, `resolveJwks()`
// récupère les clés réelles depuis
// `https://<team-domain>/cdn-cgi/access/certs` et les met en cache pour la
// durée de vie de l'isolat Worker.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const CF_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

export type CloudflareAccessConfig = {
  /** Nom de domaine de l'équipe Zero Trust, ex. "divinemotion.cloudflareaccess.com". */
  teamDomain: string;
  /** Balise "Application Audience (AUD)" de l'application Access protégeant ce Worker. */
  audienceTag: string;
};

export type CloudflareAccessUser = {
  email: string;
};

type HeaderBag = { get(name: string): string | null };

const jwksCache = new Map<string, JWTVerifyGetKey>();

/** Récupère (et met en cache par domaine d'équipe) le jeu de clés publiques Access. */
export function resolveJwks(teamDomain: string): JWTVerifyGetKey {
  const cached = jwksCache.get(teamDomain);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksCache.set(teamDomain, jwks);
  return jwks;
}

/**
 * Vérifie la requête courante contre une politique Cloudflare Access.
 * Retourne `null` (jamais ne lève) si l'en-tête est absent, le JWT invalide,
 * expiré, mal signé, ou destiné à une autre application/équipe — dans tous
 * ces cas l'appelant doit traiter la requête comme non authentifiée, jamais
 * comme une erreur serveur.
 */
export async function verifyCloudflareAccess(
  headerBag: HeaderBag,
  config: CloudflareAccessConfig,
  jwks: JWTVerifyGetKey = resolveJwks(config.teamDomain),
): Promise<CloudflareAccessUser | null> {
  const token = headerBag.get(CF_ACCESS_JWT_HEADER);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${config.teamDomain}`,
      audience: config.audienceTag,
    });

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!email) {
      console.warn("[cloudflare-access] JWT valide mais sans revendication email exploitable");
      return null;
    }
    return { email };
  } catch (error) {
    // Un JWT invalide (mauvaise signature, expiré, mauvaise audience/émetteur,
    // malformé) est un événement normal — pas une exception à propager. On ne
    // journalise que le type d'erreur, jamais le contenu du jeton.
    console.warn("[cloudflare-access] JWT rejeté", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
