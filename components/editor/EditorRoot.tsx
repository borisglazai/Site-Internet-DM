"use client";
// EditorRoot — le seul point de contact entre le serveur et le client de
// l'éditeur V2. Générique : il ne connaît HomeBody/WorkBody/etc. ni leurs
// dépendances (setting(), publishedProjects(), ...) — il reçoit `children`
// déjà entièrement rendu côté serveur par le composant Body concerné et se
// contente de l'encapsuler.
//
// Pourquoi pas un composant par page (HomeEditor, WorkEditor, ...) impor­tant
// directement HomeBody/WorkBody ? Parce que ces fichiers (app/page.tsx,
// app/notre-travail/page.tsx, ...) exportent AUSSI leurs fonctions de
// chargement serveur (setting(), publishedProjects(), ...) dans le même
// module : les importer depuis un composant "use client" entraînerait tout
// le graphe serveur (jusqu'à cloudflare:workers) dans le bundle client, ce
// que le build rejette. Passer le Body déjà rendu en `children` depuis le
// composant serveur (app/admin/editor-v2/**/page.tsx) évite ce problème sans
// toucher aux fichiers publics.
import { EditorProvider } from "../../lib/editor-v2/store";
import { EditorShell } from "./EditorShell";
import { TextEditor } from "./TextEditor";
import type { PageKey } from "../../lib/editor-v2/types";

export function EditorRoot({
  pageKey,
  initial,
  hasDraft = false,
  pageLabel,
  editUrl,
  previewUrl,
  preview = false,
  children,
}: {
  pageKey: PageKey | string;
  initial: object;
  hasDraft?: boolean;
  pageLabel: string;
  editUrl: string;
  previewUrl: string;
  preview?: boolean;
  children: React.ReactNode;
}) {
  if (preview) return <PreviewReturn editUrl={editUrl}>{children}</PreviewReturn>;
  return (
    <EditorProvider pageKey={pageKey} initial={initial} hasDraft={hasDraft}>
      <EditorShell pageLabel={pageLabel} editUrl={editUrl} previewUrl={previewUrl} />
      <TextEditor>{children}</TextEditor>
    </EditorProvider>
  );
}

function PreviewReturn({ editUrl, children }: { editUrl: string; children: React.ReactNode }) {
  // Aucune barre, aucun state d'édition en aperçu — juste le rendu (déjà
  // non-éditable, voir le composant serveur appelant) et un retour à
  // l'éditeur, comme V1. Pas de classe ve2-active : rien à décaler puisque
  // la barre n'existe pas ici.
  return (
    <>
      <a className="ve2-preview-return ve2-ui" href={editUrl}>
        ← Retour à l’éditeur
      </a>
      {children}
    </>
  );
}
