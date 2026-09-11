import type { Metadata } from "next";
import Link from "next/link";
import { MediaPlaceholder, PageShell } from "../site-components";
import { displayDate, mediaUrl, pageMetadata, publishedProjects, setting } from "../../lib/public-cms";
import { normalizeChapterMedia } from "../../lib/media-normalize";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("work", "Notre travail", "Découvrez les histoires photographiées et filmées par Divine Motion.");
}
export const dynamic = "force-dynamic";

const chapterDefaults = [
  { title: "Les préparatifs", text: "Les gestes calmes, les derniers détails et l’émotion qui monte.", media: [] },
  { title: "La cérémonie", text: "Les promesses, la foi et les instants qui donnent tout son sens à la journée.", media: [] },
  { title: "Les portraits", text: "Un temps pour respirer, se retrouver et créer des images à deux.", media: [] },
  { title: "Les proches", text: "Les regards, les étreintes et la présence de ceux qui comptent.", media: [] },
  { title: "La célébration", text: "L’énergie, les rires et la joie partagée.", media: [] },
  { title: "Les détails", text: "Tout ce qui a été pensé avec soin et mérite d’être conservé.", media: [] },
];

export const workDefaults = {
  eyebrow: "Portfolio éditorial",
  title: "Notre travail",
  intro: "Nous ne cherchons pas seulement les belles images. Nous cherchons les instants qui racontent quelque chose.",
  storyLabel: "Histoire 01 · Mariage",
  storyTitle: "David & Emmanuella",
  storyDate: "2026-08-08",
  storyText: "Une journée remplie d’émotion, de foi, de famille et de célébration.",
  storyCoverMediaId: null,
  storyCoverAlt: "David & Emmanuella",
  chapters: chapterDefaults,
  filmTitle: "Revivre les voix, les gestes, l’atmosphère.",
  filmMediaId: null,
  projectsTitle: "De nouvelles histoires, au fil du temps.",
  projectsIntro: "Chaque projet publié depuis l’espace Divine Motion rejoint automatiquement cette collection.",
  urbanLabel: "Portraits & lifestyle",
  urbanTitle: "Dans la ville",
  urbanIntro: "Portraits, mouvement et lumière naturelle. Une parenthèse plus contemporaine, spontanée et urbaine.",
  urbanGallery: [],
  urbanCta: "Imaginer votre séance",
  urbanCtaUrl: "/contact?type=shooting",
  sectionOrder: ["story", "chapters", "film", "projects", "urban"],
  hiddenSections: [],
  customSections: [],
};

export async function loadWorkPublished() {
  const projects = await publishedProjects();
  const stored = await setting("work", workDefaults);
  const general = await setting("general", {});
  return { work: { ...workDefaults, ...stored, general }, projects };
}

// Rendu partagé entre la page publique (editable=false) et l'éditeur visuel
// protégé sous /admin/editor/notre-travail (editable=true) — voir
// app/page.tsx pour le même principe appliqué à l'accueil.
export function WorkBody({
  work,
  projects,
  editable = false,
  editBasePath,
}: {
  work: Record<string, any>;
  projects: any[];
  editable?: boolean;
  editBasePath?: string;
}) {
  const ea = (attrs: Record<string, string>) => (editable ? attrs : {});
  // `hiddenSections` était déjà déclaré dans les valeurs par défaut mais
  // jamais relu au rendu sur cette page (voir l'audit Phase UX 2) : "Masquer"
  // depuis l'éditeur n'avait donc aucun effet visible ni public. On reproduit
  // ici le comportement déjà correct de l'accueil (app/page.tsx) : la
  // section masquée disparaît du site public, et reste visible mais atténuée
  // dans l'éditeur pour pouvoir être réaffichée — sans wrapper supplémentaire,
  // pour ne rien changer à la structure/au design public.
  const hidden = (key: string) => (work.hiddenSections || []).includes(key);
  const shellClass = (key: string, base: string) => (hidden(key) ? `${base} ve-hidden-section` : base);
  const shown = (key: string) => !hidden(key) || editable;

  // `work.chapters` vient d'un JSON libre (cms_settings), sans passer par la
  // normalisation déjà appliquée aux galeries de projets (lib/public-cms.ts).
  // Une entrée `null`/`undefined` dans `chapters[i].media` faisait planter le
  // rendu de cette page (voir AUDIT_DIVINE_MOTION.md, correctif Phase 1 #2).
  // On normalise uniquement la copie utilisée pour l'affichage ; `work` (et
  // donc l'état initial transmis à <VisualEditor>) n'est pas modifié.
  // `includeHidden: true` conserve le comportement existant : cette page n'a
  // jamais filtré les médias marqués masqués.
  const chapters = (Array.isArray(work.chapters) ? work.chapters : []).map((chapter) =>
    normalizeChapterMedia(chapter, { includeHidden: true }),
  );

  return (
    <PageShell general={work.general} editable={editable} editBasePath={editBasePath}>
      <div className={editable ? "visual-editing" : ""}>
        {shown("work-hero") && (
          <section className={shellClass("work-hero", "page-hero dark-page")} {...ea({ "data-section-key": "work-hero" })}>
            <div className="wrap">
              <p className="eyebrow light" {...ea({ "data-edit-key": "eyebrow" })}>{work.eyebrow}</p>
              <h1 {...ea({ "data-edit-key": "title" })}>{work.title}</h1>
              <p {...ea({ "data-edit-key": "intro" })}>{work.intro}</p>
            </div>
          </section>
        )}

        {shown("story") && (
          <section className={shellClass("story", "story-intro section wrap")} {...ea({ "data-section-key": "story" })}>
            <div>
              <p className="section-index" {...ea({ "data-edit-key": "storyLabel" })}>{work.storyLabel}</p>
              <h2 {...ea({ "data-edit-key": "storyTitle" })}>{work.storyTitle}</h2>
            </div>
            <div>
              <p className="story-date">{displayDate(work.storyDate)}</p>
              <p {...ea({ "data-edit-key": "storyText" })}>{work.storyText}</p>
            </div>
          </section>
        )}

        <div {...ea({ "data-media-key": "storyCoverMediaId", "data-alt-key": "storyCoverAlt" })}>
          {work.storyCoverMediaId ? (
            <img
              className="story-cover cms-image"
              src={mediaUrl(work.storyCoverMediaId, "desktop")}
              alt={work.storyCoverAlt}
            />
          ) : (
            <MediaPlaceholder className="story-cover" label="Image d’ouverture du mariage" ratio="landscape" />
          )}
        </div>

        {shown("chapters") && (
        <section className={shellClass("chapters", "story-flow wrap")} {...ea({ "data-section-key": "chapters" })}>
          {chapters.map((chapter: any, i: number) => (
            <article className={i % 2 ? "chapter reverse" : "chapter"} {...ea({ "data-section-key": `work-chapter:${i}` })} key={i}>
              <div className="chapter-copy">
                <span>0{i + 1}</span>
                <h2 {...ea({ "data-edit-key": `chapters.${i}.title` })}>{chapter.title}</h2>
                <p {...ea({ "data-edit-key": `chapters.${i}.text` })}>{chapter.text}</p>
              </div>
              <div className="chapter-media" {...ea({ "data-gallery-key": `chapters.${i}.media` })}>
                {chapter.media.length ? (
                  chapter.media.map((entry: any, j: number) => (
                    <figure
                      key={`${entry.id}-${j}`}
                      {...ea({ "data-media-key": `chapters.${i}.media.${j}.id`, "data-alt-key": `chapters.${i}.media.${j}.alt` })}
                    >
                      <img className="cms-image" src={mediaUrl(entry.id, "desktop")} alt={entry.alt || chapter.title} />
                      {entry.caption && (
                        <figcaption {...ea({ "data-edit-key": `chapters.${i}.media.${j}.caption` })}>{entry.caption}</figcaption>
                      )}
                    </figure>
                  ))
                ) : (
                  <div {...ea({ "data-media-key": `chapters.${i}.media.0.id` })}>
                    <MediaPlaceholder label={chapter.title} ratio={i === 2 || i === 3 ? "portrait" : "landscape"} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
        )}

        {shown("film") && (
        <section className={shellClass("film", "section dark-section")} id="film" {...ea({ "data-section-key": "film" })}>
          <div className="wrap film-story">
            <div>
              <p className="section-index light">Le film</p>
              <h2 {...ea({ "data-edit-key": "filmTitle" })}>{work.filmTitle}</h2>
            </div>
            <div className="film-frame" {...ea({ "data-media-key": "filmMediaId", "data-media-types": "video,external_video" })}>
              <span className="play">▶</span>
            </div>
          </div>
        </section>
        )}

        {projects.length > 0 && shown("projects") && (
          <section className={shellClass("projects", "section wrap cms-project-index")} {...ea({ "data-section-key": "projects" })}>
            <div className="split-heading">
              <div>
                <p className="section-index">Histoires publiées</p>
                <h2 {...ea({ "data-edit-key": "projectsTitle" })}>{work.projectsTitle}</h2>
              </div>
              <p {...ea({ "data-edit-key": "projectsIntro" })}>{work.projectsIntro}</p>
            </div>
            <div className="cms-project-grid">
              {projects.map((project) => (
                <Link href={`/projets/${project.slug}`} key={project.id}>
                  <div>
                    {project.coverMediaId ? (
                      <img
                        className="cms-image"
                        src={mediaUrl(project.coverMediaId, "desktop")}
                        alt={project.peopleNames || project.title}
                      />
                    ) : (
                      <MediaPlaceholder label={project.title} ratio="landscape" />
                    )}
                  </div>
                  <span>{project.category}</span>
                  <h3>{project.peopleNames || project.title}</h3>
                  <p>{project.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {shown("urban") && (
        <section className={shellClass("urban", "urban section wrap")} {...ea({ "data-section-key": "urban" })}>
          <div className="split-heading">
            <div>
              <p className="section-index" {...ea({ "data-edit-key": "urbanLabel" })}>{work.urbanLabel}</p>
              <h2 {...ea({ "data-edit-key": "urbanTitle" })}>{work.urbanTitle}</h2>
            </div>
            <p {...ea({ "data-edit-key": "urbanIntro" })}>{work.urbanIntro}</p>
          </div>
          <div className="urban-grid" {...ea({ "data-gallery-key": "urbanGallery" })}>
            {[0, 1, 2].map((i: number) => {
              const entry = work.urbanGallery?.[i];
              const id = typeof entry === "object" ? entry?.id : entry;
              return (
                <div key={i} {...ea({ "data-media-key": `urbanGallery.${i}.id`, "data-alt-key": `urbanGallery.${i}.alt` })}>
                  {id ? (
                    <img className="cms-image" src={mediaUrl(id, "desktop")} alt={entry?.alt || work.urbanTitle} />
                  ) : (
                    <MediaPlaceholder label="Portrait urbain réel" ratio={i === 1 ? "landscape" : "portrait"} />
                  )}
                </div>
              );
            })}
          </div>
          <Link
            className="button button-dark"
            href={work.urbanCtaUrl || "/contact"}
            {...ea({ "data-link-label-key": "urbanCta", "data-link-url-key": "urbanCtaUrl" })}
          >
            <span {...ea({ "data-edit-key": "urbanCta" })}>{work.urbanCta}</span>
          </Link>
        </section>
        )}
      </div>
    </PageShell>
  );
}

export default async function Work() {
  const { work, projects } = await loadWorkPublished();
  return <WorkBody work={work} projects={projects} />;
}
