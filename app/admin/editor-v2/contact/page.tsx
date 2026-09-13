import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { ContactBody, loadContactPublished } from "../../../contact/page";
import { normalizeContactContent } from "../../../../lib/editor-v2/normalize";
import { EditorRoot } from "../../../../components/editor/EditorRoot";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function ContactEditorV2Page({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = normalizeContactContent(await loadContactPublished());
  const raw = await visualContent("contact", published, true);
  const content = normalizeContactContent(raw);
  const draftExists = await hasDraft("contact");
  return (
    <EditorRoot
      key="contact"
      pageKey="contact"
      initial={content}
      hasDraft={draftExists}
      pageLabel="Contact"
      editUrl="/admin/editor-v2/contact"
      previewUrl="/admin/editor-v2/contact?preview=1"
      preview={isPreview}
    >
      <ContactBody contact={content} editable={!isPreview} editBasePath="/admin/editor-v2" />
    </EditorRoot>
  );
}
