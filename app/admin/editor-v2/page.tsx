import { setting, publishedProjects } from "../../../lib/public-cms";
import { visualContent, hasDraft } from "../../../lib/visual-editor";
import { HomeBody, homeExtendedDefaults } from "../../page";
import { normalizeHomeContent } from "../../../lib/editor-v2/normalize";
import { EditorRoot } from "../../../components/editor/EditorRoot";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function HomeEditorV2Page({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const publishedStored = await setting("home", homeExtendedDefaults);
  const published = normalizeHomeContent({ ...homeExtendedDefaults, ...publishedStored, general: await setting("general", {}) });
  const raw = await visualContent("home", published, true);
  const content = normalizeHomeContent(raw);
  const [projects, draftExists] = await Promise.all([publishedProjects(), hasDraft("home")]);
  return (
    <EditorRoot
      key="home"
      pageKey="home"
      initial={content}
      hasDraft={draftExists}
      pageLabel="Accueil"
      editUrl="/admin/editor-v2"
      previewUrl="/admin/editor-v2?preview=1"
      preview={isPreview}
    >
      <HomeBody home={content} projects={projects} editable={!isPreview} editBasePath="/admin/editor-v2" />
    </EditorRoot>
  );
}
