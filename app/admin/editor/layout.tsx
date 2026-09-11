import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthorizedAdmin } from "../../../lib/admin-auth";
import "../../visual-editor.css";

// Seul point de vérification d'identité pour tout /admin/editor/** : les
// routes filles ci-dessous n'ont pas à revérifier l'auth (voir
// STAGING_TEST_REPORT.md et l'audit du visual editor). Non authentifié →
// renvoyé vers /admin, qui affiche l'écran de connexion approprié
// (SIWC ou Cloudflare Access selon l'environnement, voir lib/admin-auth.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthorizedAdmin();
  if (!user) redirect("/admin");
  return <>{children}</>;
}
