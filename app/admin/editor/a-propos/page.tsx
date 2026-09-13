import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { editorMedia } from "../../../../lib/editor-page";
import { AboutBody, loadAboutPublished } from "../../../a-propos/page";
import { VisualEditor } from "../../../visual-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function AboutEditorPage({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = await loadAboutPublished();
  const about = await visualContent("about", published, true);
  const [media, draftExists] = await Promise.all([editorMedia(), hasDraft("about")]);
  return (
    <>
      <AboutBody about={about} editable={!isPreview} editBasePath="/admin/editor" />
      <VisualEditor
        key="about"
        pageKey="about"
        initial={about}
        media={media as any[]}
        preview={isPreview}
        editUrl="/admin/editor/a-propos"
        previewUrl="/admin/editor/a-propos?preview=1"
        pageLabel="À propos"
        hasDraft={draftExists}
      />
    </>
  );
}
