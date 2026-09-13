import { visualContent, hasDraft } from "../../../../lib/visual-editor";
import { editorMedia } from "../../../../lib/editor-page";
import { ContactBody, loadContactPublished } from "../../../contact/page";
import { VisualEditor } from "../../../visual-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function ContactEditorPage({ searchParams }: Props) {
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = await loadContactPublished();
  const contact = await visualContent("contact", published, true);
  const [media, draftExists] = await Promise.all([editorMedia(), hasDraft("contact")]);
  return (
    <>
      <ContactBody contact={contact} editable={!isPreview} editBasePath="/admin/editor" />
      <VisualEditor
        key="contact"
        pageKey="contact"
        initial={contact}
        media={media as any[]}
        preview={isPreview}
        editUrl="/admin/editor/contact"
        previewUrl="/admin/editor/contact?preview=1"
        pageLabel="Contact"
        hasDraft={draftExists}
      />
    </>
  );
}
