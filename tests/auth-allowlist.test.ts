// Tests de lib/auth-allowlist.ts — correctif Phase 1 #4 (frontière
// d'authentification). Couvre le seul critère d'autorisation applicatif :
// la correspondance à ADMIN_EMAILS. Voir AUTH_TRUST_MODEL.md pour ce que ce
// test ne peut PAS couvrir (l'authenticité de l'en-tête lui-même).
import test from "node:test";
import assert from "node:assert/strict";
import { isEmailAllowed, parseAllowedEmails } from "../lib/auth-allowlist.ts";

test("parseAllowedEmails: normalise casse et espaces, ignore les entrées vides", () => {
  assert.deepEqual(
    parseAllowedEmails(" Admin@Example.com , contact@divine-motion.com,, "),
    ["admin@example.com", "contact@divine-motion.com"],
  );
});

test("parseAllowedEmails: tolère undefined/null", () => {
  assert.deepEqual(parseAllowedEmails(undefined), []);
  assert.deepEqual(parseAllowedEmails(null), []);
  assert.deepEqual(parseAllowedEmails(""), []);
});

test("isEmailAllowed: correspondance exacte", () => {
  assert.equal(isEmailAllowed("admin@example.com", "admin@example.com"), true);
});

test("isEmailAllowed: insensible à la casse et aux espaces des deux côtés", () => {
  assert.equal(isEmailAllowed("  Admin@Example.com  ", "admin@example.com,autre@example.com"), true);
  assert.equal(isEmailAllowed("admin@example.com", " ADMIN@EXAMPLE.COM "), true);
});

test("isEmailAllowed: refuse un e-mail absent de la liste", () => {
  assert.equal(isEmailAllowed("intrus@example.com", "admin@example.com,autre@example.com"), false);
});

test("isEmailAllowed: échoue fermé si l'allowlist est vide ou absente", () => {
  assert.equal(isEmailAllowed("admin@example.com", ""), false, "liste vide = accès refusé à tout le monde");
  assert.equal(isEmailAllowed("admin@example.com", undefined), false);
  assert.equal(isEmailAllowed("admin@example.com", null), false);
});

test("isEmailAllowed: échoue fermé si aucun e-mail n'est fourni", () => {
  assert.equal(isEmailAllowed(undefined, "admin@example.com"), false);
  assert.equal(isEmailAllowed(null, "admin@example.com"), false);
  assert.equal(isEmailAllowed("", "admin@example.com"), false);
});

test("isEmailAllowed: une sous-chaîne ne suffit pas (pas de correspondance partielle)", () => {
  assert.equal(isEmailAllowed("admin@example.com.evil.test", "admin@example.com"), false);
  assert.equal(isEmailAllowed("notadmin@example.com", "admin@example.com"), false);
});
