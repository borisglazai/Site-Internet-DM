import { NextResponse } from "next/server";

// Empêche toute réponse admin (page ou API) d'être mise en cache par un
// intermédiaire (navigateur, proxy, ou une règle de cache Cloudflare mal
// configurée sur ce domaine) et servie ensuite à un autre visiteur — testé
// vide de tout en-tête `Cache-Control` avant ce correctif (voir
// STAGING_TEST_REPORT.md, section 16). N'affecte aucune route publique.
export function middleware() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
