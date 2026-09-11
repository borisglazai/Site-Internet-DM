import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { visualContent, hasDraft } from "../../../../../lib/visual-editor";
import { editorMedia } from "../../../../../lib/editor-page";
import { ProjectBody, loadProjectPublished } from "../../../../projets/[slug]/page";
import { VisualEditor } from "../../../../visual-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export default async function ProjectEditorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const isPreview = query.preview === "1";
  const published = await loadProjectPublished(slug, true);
  if (!published) notFound();
  const project = await visualContent(`project_${published.id}`, published, true);
  const [media, draftExists] = await Promise.all([editorMedia(), hasDraft(`project_${published.id}`)]);
  return (
    <>
      <ProjectBody project={project} editable={!isPreview} preview={isPreview} editBasePath="/admin/editor" />
      <VisualEditor
        pageKey={`project_${project.id}`}
        initial={project}
        media={media as any[]}
        preview={isPreview}
        editUrl={`/admin/editor/projets/${slug}`}
        previewUrl={`/admin/editor/projets/${slug}?preview=1`}
        pageLabel={project.peopleNames || project.title}
        hasDraft={draftExists}
      />
    </>
  );
}
