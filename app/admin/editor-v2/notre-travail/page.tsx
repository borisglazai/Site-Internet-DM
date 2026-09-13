import { setting, publishedProjects } from "../../../../lib/public-cms";
import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { WorkBody, workDefaults } from "../../../notre-travail/page";
import { normalizeWorkContent } from "../../../../lib/editor-v2/normalize";
import { EditorRoot } from "../../../../components/editor/EditorRoot";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function WorkEditorV2Page({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const stored = await setting("work", workDefaults);
  const published = normalizeWorkContent({ ...workDefaults, ...stored, general: await setting("general", {}) });
  const raw = await visualContent("work", published, true);
  const content = normalizeWorkContent(raw);
  const [projects, draftExists] = await Promise.all([publishedProjects(), hasDraft("work")]);
  return (
    <EditorRoot
      key="work"
      pageKey="work"
      initial={content}
      hasDraft={draftExists}
      pageLabel="Notre travail"
      editUrl="/admin/editor-v2/notre-travail"
      previewUrl="/admin/editor-v2/notre-travail?preview=1"
      preview={isPreview}
    >
      <WorkBody work={content} projects={projects} editable={!isPreview} editBasePath="/admin/editor-v2" />
    </EditorRoot>
  );
}
