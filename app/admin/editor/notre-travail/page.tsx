import { setting, publishedProjects } from "../../../../lib/public-cms";
import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { editorMedia } from "../../../../lib/editor-page";
import { WorkBody, workDefaults } from "../../../notre-travail/page";
import { VisualEditor } from "../../../visual-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function WorkEditorPage({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const stored = await setting("work", workDefaults);
  const published = { ...workDefaults, ...stored, general: await setting("general", {}) };
  const work = await visualContent("work", published, true);
  const [projects, media, draftExists] = await Promise.all([publishedProjects(), editorMedia(), hasDraft("work")]);
  return (
    <>
      <WorkBody work={work} projects={projects} editable={!isPreview} editBasePath="/admin/editor" />
      <VisualEditor
        pageKey="work"
        initial={work}
        media={media as any[]}
        preview={isPreview}
        editUrl="/admin/editor/notre-travail"
        previewUrl="/admin/editor/notre-travail?preview=1"
        pageLabel="Notre travail"
        hasDraft={draftExists}
      />
    </>
  );
}
