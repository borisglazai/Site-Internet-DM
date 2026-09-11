import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { displayDate, mediaUrl, publishedProject, setting } from "../../../lib/public-cms";
import { MediaPlaceholder, PageShell } from "../../site-components";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const project = await publishedProject(slug);
  if (!project) return {};
  return {
    title: project.seoTitle || project.title,
    description: project.seoDescription || project.excerpt,
    openGraph: project.seoImageMediaId ? { images: [mediaUrl(project.seoImageMediaId, "desktop")] } : undefined,
  };
}

export async function loadProjectPublished(slug: string, includeDraft = false) {
  const published = await publishedProject(slug, includeDraft);
  if (!published) return null;
  const general = await setting("general", {});
  return {
    ...published,
    status: "published",
    visible: true,
    general,
    sections: published.sections.map((section: any) => ({
      sectionKey: section.section_key || section.sectionKey,
      title: section.title,
      intro: section.intro,
      media: section.media || [],
      videos: section.videos || [],
      enabled: section.enabled !== 0,
    })),
  };
}

// Rendu partagé entre la page projet publique (editable=false) et l'éditeur
// visuel protégé sous /admin/editor/projets/[slug] (editable=true).
export function ProjectBody({
  project,
  editable = false,
  preview = false,
  editBasePath,
}: {
  project: Record<string, any>;
  editable?: boolean;
  preview?: boolean;
  editBasePath?: string;
}) {
  const ea = (attrs: Record<string, string>) => (editable ? attrs : {});
  const title = project.peopleNames || project.title;
  return (
    <PageShell general={project.general} editable={editable} editBasePath={editBasePath}>
      {preview && <div className="preview-banner">Prévisualisation privée — aucune modification n’est publiée</div>}
      <main className={editable ? "visual-editing" : ""}>
        <section className="story-intro section wrap" {...ea({ "data-section-key": "project-intro", "data-section-locked": "true" })}>
          <div>
            <p className="section-index" {...ea({ "data-edit-key": "category" })}>{project.category}</p>
            <h1 {...ea({ "data-edit-key": project.peopleNames ? "peopleNames" : "title" })}>{title}</h1>
          </div>
          <div>
            <p className="story-date">{displayDate(project.projectDate)}</p>
            <p {...ea({ "data-edit-key": "excerpt" })}>{project.excerpt}</p>
            {project.location && <p {...ea({ "data-edit-key": "location" })}>{project.location}</p>}
          </div>
        </section>

        <div {...ea({ "data-media-key": "coverMediaId" })}>
          {project.coverMediaId ? (
            <img className="story-cover cms-image" src={mediaUrl(project.coverMediaId, "desktop")} alt={title} />
          ) : (
            <MediaPlaceholder className="story-cover" label={title} ratio="landscape" />
          )}
        </div>

        <section className="story-flow wrap" {...ea({ "data-section-key": "project-chapters" })}>
          {project.sections?.length ? (
            project.sections.map((section: any, index: number) =>
              section.enabled === false && !editable ? null : (
                <article className={index % 2 ? "chapter reverse" : "chapter"} {...ea({ "data-section-key": `chapter:${index}` })} key={section.id || section.sectionKey || index}>
                  <div className="chapter-copy">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h2 {...ea({ "data-edit-key": `sections.${index}.title` })}>{section.title || section.sectionKey}</h2>
                    <p {...ea({ "data-edit-key": `sections.${index}.intro` })}>{section.intro}</p>
                  </div>
                  <div className="chapter-media" {...ea({ "data-gallery-key": `sections.${index}.media` })}>
                    {(section.media || []).map((entry: any, mediaIndex: number) => (
                      <figure key={`${entry.id}-${mediaIndex}`} {...ea({ "data-media-key": `sections.${index}.media.${mediaIndex}.id`, "data-alt-key": `sections.${index}.media.${mediaIndex}.alt` })}>
                        <img className="cms-image" src={mediaUrl(entry.id, "desktop")} alt={entry.alt || section.title || title} />
                        {entry.caption && <figcaption {...ea({ "data-edit-key": `sections.${index}.media.${mediaIndex}.caption` })}>{entry.caption}</figcaption>}
                      </figure>
                    ))}
                    {!(section.media || []).length && (
                      <div {...ea({ "data-media-key": `sections.${index}.media.0.id` })}>
                        <MediaPlaceholder label={section.title || section.sectionKey} ratio={index % 3 === 2 ? "portrait" : "landscape"} />
                      </div>
                    )}
                  </div>
                </article>
              ),
            )
          ) : (
            <article className="chapter">
              <div className="chapter-copy">
                <span>01</span>
                <h2 {...ea({ "data-edit-key": "title" })}>{project.title}</h2>
                <p {...ea({ "data-edit-key": "description" })}>{project.description}</p>
              </div>
              <div className="chapter-media" {...ea({ "data-gallery-key": "gallery" })}>
                {project.gallery.map((entry: any, index: number) => (
                  <figure key={`${entry.id}-${index}`} {...ea({ "data-media-key": `gallery.${index}.id`, "data-alt-key": `gallery.${index}.alt` })}>
                    <img className="cms-image" src={mediaUrl(entry.id, "desktop")} alt={entry.alt || title} />
                    {entry.caption && <figcaption {...ea({ "data-edit-key": `gallery.${index}.caption` })}>{entry.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </article>
          )}
        </section>

        {project.videos?.[0] && (
          <section className="section dark-section" {...ea({ "data-section-key": "project-film" })}>
            <div className="wrap film-story">
              <h2>Le film</h2>
              <div className="film-frame" {...ea({ "data-media-key": "videos.0.mediaId", "data-media-types": "video,external_video" })}>
                <span className="play">▶</span>
              </div>
            </div>
          </section>
        )}
      </main>
    </PageShell>
  );
}

export default async function ProjectPage({ params }: Params) {
  const { slug } = await params;
  const project = await loadProjectPublished(slug);
  if (!project) notFound();
  return <ProjectBody project={project} />;
}
