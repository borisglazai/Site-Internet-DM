import { setting, publishedProjects } from "../../../lib/public-cms";
import { visualContent, hasDraft } from "../../../lib/visual-editor";
import { editorMedia } from "../../../lib/editor-page";
import { HomeBody, homeExtendedDefaults } from "../../page";
import { VisualEditor } from "../../visual-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function HomeEditorPage({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const publishedStored = await setting("home", homeExtendedDefaults);
  const published = { ...homeExtendedDefaults, ...publishedStored, general: await setting("general", {}) };
  const home = await visualContent("home", published, true);
  const [projects, media, draftExists] = await Promise.all([publishedProjects(), editorMedia(), hasDraft("home")]);
  return (
    <>
      <HomeBody home={home} projects={projects} editable={!isPreview} editBasePath="/admin/editor" />
      <VisualEditor
        key="home"
        pageKey="home"
        initial={home}
        media={media as any[]}
        preview={isPreview}
        editUrl="/admin/editor"
        previewUrl="/admin/editor?preview=1"
        pageLabel="Accueil"
        hasDraft={draftExists}
      />
    </>
  );
}
