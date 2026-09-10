// Tests de lib/auth/cloudflare-access.ts — vérification réelle de signature
// JWT (pas un mock de la fonction), sans réseau : on génère une vraie paire
// de clés RSA, on signe un vrai JWT avec `jose`, et on l'expose comme "JWKS"
// local injecté à la place de l'appel réseau à cloudflareaccess.com. Le code
// exercé est exactement celui qui tournera en production.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK, type JWTVerifyGetKey } from "jose";
import { verifyCloudflareAccess, CF_ACCESS_JWT_HEADER } from "../lib/auth/cloudflare-access.ts";

const TEAM_DOMAIN = "divinemotion-test.cloudflareaccess.com";
const AUDIENCE = "test-application-aud-tag";

class HeaderBag {
  #values: Map<string, string>;
  constructor(values: Record<string, string> = {}) {
    this.#values = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  }
  get(name: string): string | null {
    return this.#values.get(name.toLowerCase()) ?? null;
  }
}

async function makeKeyPair() {
  return generateKeyPair("RS256", { extractable: true });
}

/** Construit un JWTVerifyGetKey local qui ne connaît que cette clé publique. */
function localJwks(publicKey: CryptoKey): JWTVerifyGetKey {
  return async () => publicKey;
}

async function signToken(
  privateKey: CryptoKey,
  overrides: Partial<{ email: string; aud: string; iss: string; expiresIn: string }> = {},
) {
  const builder = new SignJWT({ email: overrides.email ?? "admin@example.com" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(overrides.iss ?? `https://${TEAM_DOMAIN}`)
    .setAudience(overrides.aud ?? AUDIENCE)
    .setExpirationTime(overrides.expiresIn ?? "5m");
  return builder.sign(privateKey);
}

test("verifyCloudflareAccess: accepte un JWT valide et en extrait l'e-mail", async () => {
  const { privateKey, publicKey } = await makeKeyPair();
  const token = await signToken(privateKey, { email: "admin@divine-motion.example" });
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: token });

  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));

  assert.deepEqual(user, { email: "admin@divine-motion.example" });
});

test("verifyCloudflareAccess: retourne null sans en-tête (pas une erreur)", async () => {
  const { publicKey } = await makeKeyPair();
  const headers = new HeaderBag();
  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));
  assert.equal(user, null);
});

test("verifyCloudflareAccess: rejette une mauvaise signature (autre paire de clés)", async () => {
  const { privateKey } = await makeKeyPair();
  const { publicKey: unrelatedPublicKey } = await makeKeyPair();
  const token = await signToken(privateKey);
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: token });

  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(unrelatedPublicKey));
  assert.equal(user, null);
});

test("verifyCloudflareAccess: rejette une audience (application) différente", async () => {
  const { privateKey, publicKey } = await makeKeyPair();
  const token = await signToken(privateKey, { aud: "une-autre-application" });
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: token });

  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));
  assert.equal(user, null);
});

test("verifyCloudflareAccess: rejette un émetteur (équipe) différent", async () => {
  const { privateKey, publicKey } = await makeKeyPair();
  const token = await signToken(privateKey, { iss: "https://une-autre-equipe.cloudflareaccess.com" });
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: token });

  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));
  assert.equal(user, null);
});

test("verifyCloudflareAccess: rejette un jeton expiré", async () => {
  const { privateKey, publicKey } = await makeKeyPair();
  const token = await signToken(privateKey, { expiresIn: "-1m" });
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: token });

  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));
  assert.equal(user, null);
});

test("verifyCloudflareAccess: rejette un JWT valide mais sans revendication email", async () => {
  const { privateKey, publicKey } = await makeKeyPair();
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(`https://${TEAM_DOMAIN}`)
    .setAudience(AUDIENCE)
    .setExpirationTime("5m")
    .sign(privateKey);
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: token });

  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));
  assert.equal(user, null);
});

test("verifyCloudflareAccess: rejette un jeton malformé sans planter", async () => {
  const { publicKey } = await makeKeyPair();
  const headers = new HeaderBag({ [CF_ACCESS_JWT_HEADER]: "ceci-nest-pas-un-jwt" });
  const user = await verifyCloudflareAccess(headers, { teamDomain: TEAM_DOMAIN, audienceTag: AUDIENCE }, localJwks(publicKey));
  assert.equal(user, null);
});

// Garde-fou : exportJWK est utilisé pour documenter/valider que la clé
// publique générée ici est bien une clé JWK exploitable (comme celles
// réellement publiées par Cloudflare sur /cdn-cgi/access/certs), pas
// seulement un objet CryptoKey opaque propre à ce test.
test("le format de clé utilisé par les tests correspond à un vrai JWK (RSA public)", async () => {
  const { publicKey } = await makeKeyPair();
  const jwk = await exportJWK(publicKey);
  assert.equal(jwk.kty, "RSA");
  assert.ok(jwk.n && jwk.e, "une clé publique RSA JWK expose n (module) et e (exposant)");
});
