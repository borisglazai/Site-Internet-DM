import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";
import { isEmailAllowed } from "./auth-allowlist";

type RuntimeEnv = { ADMIN_EMAILS?: string };

/**
 * Résout l'utilisateur admin autorisé pour la requête courante, ou `null`.
 *
 * Frontière de confiance (voir AUTH_TRUST_MODEL.md) : `getChatGPTUser()` lit
 * l'en-tête `oai-authenticated-user-email` injecté par la plateforme
 * d'hébergement. Cette fonction ne fait qu'ajouter le seul contrôle qui
 * relève du code applicatif : l'e-mail affirmé doit figurer, tel quel, dans
 * l'allowlist serveur `ADMIN_EMAILS`. Aucun rôle ni permission n'est jamais
 * lu depuis une valeur contrôlée par le client.
 */
export async function getAuthorizedAdmin(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (!user) return null;

  const allowedEmailsRaw = (env as unknown as RuntimeEnv).ADMIN_EMAILS || "";
  if (!isEmailAllowed(user.email, allowedEmailsRaw)) {
    // Journal des refus (pas des accès anonymes, trop fréquents pour être
    // utiles) : aide à détecter un compte compromis ou une tentative de
    // sondage de /admin, sans stocker en base pour rester minimal en Phase 1.
    console.warn("[admin-auth] accès refusé pour un utilisateur authentifié", { email: user.email });
    return null;
  }
  return user;
}

/**
 * À utiliser en tête de toute route `/api/admin/*`. Lève une `Response` 401
 * (interceptée par le bloc catch de la route) si l'appelant n'est pas un
 * admin autorisé — jamais de dégradation silencieuse vers un accès partiel.
 */
export async function requireAdminApi(): Promise<ChatGPTUser> {
  const user = await getAuthorizedAdmin();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Accès administrateur requis" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}
