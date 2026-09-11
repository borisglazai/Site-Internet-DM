import { visualContent } from "../../../../lib/visual-editor";
import { editorMedia } from "../../../../lib/editor-page";
import { ServicesBody, loadServicesPublished } from "../../../services/page";
import { VisualEditor } from "../../../visual-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function ServicesEditorPage({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = await loadServicesPublished();
  const page = await visualContent("services", published, true);
  const media = await editorMedia();
  return (
    <>
      <ServicesBody page={page} editable={!isPreview} editBasePath="/admin/editor" />
      <VisualEditor
        pageKey="services"
        initial={page}
        media={media as any[]}
        preview={isPreview}
        editUrl="/admin/editor/services"
        previewUrl="/admin/editor/services?preview=1"
      />
    </>
  );
}
