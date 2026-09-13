import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthorizedAdmin } from "../../../lib/admin-auth";
import "../../../components/editor/editor-v2.css";

// Éditeur V2 — même garde d'auth que /admin/editor/** (voir
// app/admin/editor/layout.tsx), dupliquée ici plutôt que partagée : V1 et V2
// doivent pouvoir évoluer indépendamment pendant la migration progressive
// (voir l'audit V2 — "l'ancien /admin/editor reste intact"). Charge son
// propre CSS (components/editor/editor-v2.css), jamais app/visual-editor.css
// (V1) : les deux éditeurs restent visuellement et techniquement isolés.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditorV2Layout({ children }: { children: React.ReactNode }) {
  const user = await getAuthorizedAdmin();
  if (!user) redirect("/admin");
  return <>{children}</>;
}
