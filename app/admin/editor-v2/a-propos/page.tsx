import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { AboutBody, loadAboutPublished } from "../../../a-propos/page";
import { normalizeAboutContent } from "../../../../lib/editor-v2/normalize";
import { EditorRoot } from "../../../../components/editor/EditorRoot";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function AboutEditorV2Page({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = normalizeAboutContent(await loadAboutPublished());
  const raw = await visualContent("about", published, true);
  const content = normalizeAboutContent(raw);
  const draftExists = await hasDraft("about");
  return (
    <EditorRoot
      key="about"
      pageKey="about"
      initial={content}
      hasDraft={draftExists}
      pageLabel="À propos"
      editUrl="/admin/editor-v2/a-propos"
      previewUrl="/admin/editor-v2/a-propos?preview=1"
      preview={isPreview}
    >
      <AboutBody about={content} editable={!isPreview} editBasePath="/admin/editor-v2" />
    </EditorRoot>
  );
}
