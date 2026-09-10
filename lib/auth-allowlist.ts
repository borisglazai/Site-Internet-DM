// Logique pure de correspondance à l'allowlist admin (`ADMIN_EMAILS`).
//
// Extraite de lib/admin-auth.ts pour deux raisons :
//   1. la rendre testable sans dépendre de "cloudflare:workers" ni de
//      "next/headers" (voir tests/auth-allowlist.test.ts) ;
//   2. isoler explicitement le SEUL critère d'autorisation admin de ce
//      projet, pour qu'il soit facile à auditer d'un coup d'œil — voir
//      AUTH_TRUST_MODEL.md.
//
// Rappel volontaire (AUTH_TRUST_MODEL.md) : ce module ne vérifie AUCUNE
// identité par lui-même. Il ne fait que comparer un e-mail déjà affirmé par
// la plateforme d'hébergement à une liste fermée configurée côté serveur. Il
// n'invente aucune cryptographie et ne doit jamais lire de rôle ou de
// permission depuis une valeur fournie par le client.

export function parseAllowedEmails(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * `email` doit être une adresse déjà authentifiée par la plateforme (jamais
 * une valeur arbitraire fournie par le client). Retourne toujours `false` si
 * `allowedEmailsRaw` est vide/absent — un allowlist vide ferme l'accès à
 * tout le monde plutôt que de l'ouvrir.
 */
export function isEmailAllowed(email: string | undefined | null, allowedEmailsRaw: string | undefined | null): boolean {
  if (!email) return false;
  const allowed = parseAllowedEmails(allowedEmailsRaw);
  if (!allowed.length) return false;
  return allowed.includes(email.trim().toLowerCase());
}
