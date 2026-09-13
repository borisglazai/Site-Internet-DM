import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { ServicesBody, loadServicesPublished } from "../../../services/page";
import { normalizeServicesContent } from "../../../../lib/editor-v2/normalize";
import { EditorRoot } from "../../../../components/editor/EditorRoot";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function ServicesEditorV2Page({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = normalizeServicesContent(await loadServicesPublished());
  const raw = await visualContent("services", published, true);
  const content = normalizeServicesContent(raw);
  const draftExists = await hasDraft("services");
  return (
    <EditorRoot
      key="services"
      pageKey="services"
      initial={content}
      hasDraft={draftExists}
      pageLabel="Services"
      editUrl="/admin/editor-v2/services"
      previewUrl="/admin/editor-v2/services?preview=1"
      preview={isPreview}
    >
      <ServicesBody page={content} editable={!isPreview} editBasePath="/admin/editor-v2" />
    </EditorRoot>
  );
}
