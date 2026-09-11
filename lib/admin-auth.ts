import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { isEmailAllowed } from "./auth-allowlist";
import { verifyCloudflareAccess } from "./auth/cloudflare-access";

type RuntimeEnv = {
  ADMIN_EMAILS?: string;
  /** Domaine d'équipe Zero Trust, ex. "divinemotion.cloudflareaccess.com". Absent = Access désactivé. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Balise "Application Audience" de l'application Access protégeant ce Worker. */
  CF_ACCESS_AUD?: string;
};

/**
 * Identité résolue, quel que soit le fournisseur qui l'a authentifiée.
 * Les routes et pages ne doivent dépendre que de cette forme, jamais des
 * détails d'un fournisseur particulier — voir `provider` uniquement à des
 * fins de journalisation/diagnostic.
 */
export type CurrentUser = {
  email: string;
  displayName: string;
  fullName: string | null;
  provider: "siwc" | "cloudflare-access";
};

/** @deprecated Conservé le temps de la migration — utiliser `CurrentUser`. */
export type ChatGPTUser = CurrentUser;

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

/**
 * Résout l'identité affirmée pour la requête courante, sans vérifier
 * l'allowlist admin — utilisé par `getAuthorizedAdmin()` ci-dessous, et
 * disponible séparément si un jour un accès "utilisateur connecté mais pas
 * forcément admin" est nécessaire.
 *
 * Deux fournisseurs, essayés dans l'ordre, jamais fusionnés :
 * 1. SIWC (`oai-authenticated-user-email`, plateforme ChatGPT Sites) —
 *    inchangé, voir AUTH_TRUST_MODEL.md. Reste actif tant qu'il n'est pas
 *    retiré explicitement (voir AUTH_MIGRATION_PLAN.md).
 * 2. Cloudflare Access (JWT `Cf-Access-Jwt-Assertion`, vérifié
 *    cryptographiquement contre les clés publiques de l'équipe) — actif
 *    uniquement si `CF_ACCESS_TEAM_DOMAIN` et `CF_ACCESS_AUD` sont
 *    configurés (c'est le cas sur le Worker staging hors Sites, pas sur le
 *    Worker Sites actuel — voir CLOUDFLARE_ACCESS_SETUP.md).
 *
 * Sur un environnement où aucune configuration Access n'existe (production
 * Sites actuelle), ce second chemin n'est jamais tenté : comportement
 * strictement identique à avant.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const siwcUser = await getChatGPTUser();
  if (siwcUser) {
    return { email: siwcUser.email, displayName: siwcUser.displayName, fullName: siwcUser.fullName, provider: "siwc" };
  }

  const { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD } = runtimeEnv();
  if (CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD) {
    const requestHeaders = await headers();
    const accessUser = await verifyCloudflareAccess(requestHeaders, {
      teamDomain: CF_ACCESS_TEAM_DOMAIN,
      audienceTag: CF_ACCESS_AUD,
    });
    if (accessUser) {
      return { email: accessUser.email, displayName: accessUser.email, fullName: null, provider: "cloudflare-access" };
    }
  }

  return null;
}

/**
 * Résout l'utilisateur admin autorisé pour la requête courante, ou `null`.
 *
 * Frontière de confiance (voir AUTH_TRUST_MODEL.md) : quel que soit le
 * fournisseur, cette fonction ajoute le seul contrôle qui relève du code
 * applicatif — l'e-mail affirmé doit figurer, tel quel, dans l'allowlist
 * serveur `ADMIN_EMAILS`. Aucun rôle ni permission n'est jamais lu depuis
 * une valeur contrôlée par le client, et la source de vérité reste
 * entièrement serveur (variable d'environnement, jamais le navigateur).
 */
export async function getAuthorizedAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const allowedEmailsRaw = runtimeEnv().ADMIN_EMAILS || "";
  if (!isEmailAllowed(user.email, allowedEmailsRaw)) {
    // Journal des refus (pas des accès anonymes, trop fréquents pour être
    // utiles) : aide à détecter un compte compromis ou une tentative de
    // sondage de /admin, sans stocker en base ni journaliser de secret.
    console.warn("[admin-auth] accès refusé pour un utilisateur authentifié", {
      email: user.email,
      provider: user.provider,
    });
    return null;
  }
  return user;
}

/** Alias de lecture — équivalent à `Boolean(await getAuthorizedAdmin())`. */
export async function isAdmin(): Promise<boolean> {
  return (await getAuthorizedAdmin()) !== null;
}

/**
 * À utiliser en tête de toute route `/api/admin/*`. Lève une `Response` 401
 * (interceptée par le bloc catch de la route) si l'appelant n'est pas un
 * admin autorisé — jamais de dégradation silencieuse vers un accès partiel.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getAuthorizedAdmin();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Accès administrateur requis" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}

// Alias conservés pour ne pas toucher aux appels existants (app/**, lib/editor-session.ts) :
// même comportement, nouveaux noms recommandés pour le code futur.
export const requireAdminApi = requireAdmin;

/**
 * Indique si Cloudflare Access est configuré pour cet environnement (les
 * deux variables sont renseignées sur le Worker déployé — voir
 * CLOUDFLARE_ACCESS_SETUP.md). Sert uniquement à choisir quel écran de
 * connexion présenter côté page (SIWC vs Access, voir app/admin/page.tsx) —
 * n'intervient jamais dans `getCurrentUser()`/`getAuthorizedAdmin()`, qui
 * essaient toujours les deux fournisseurs indépendamment de cet indicateur.
 */
export function isCloudflareAccessConfigured(): boolean {
  const { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD } = runtimeEnv();
  return Boolean(CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD);
}

/**
 * URL de déconnexion Cloudflare Access pour l'équipe configurée, ou `null`
 * si Access n'est pas configuré sur cet environnement.
 */
export function cloudflareAccessLogoutUrl(): string | null {
  const { CF_ACCESS_TEAM_DOMAIN } = runtimeEnv();
  return CF_ACCESS_TEAM_DOMAIN ? `https://${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout` : null;
}
