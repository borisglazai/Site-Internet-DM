import type { Metadata } from "next";
import Link from "next/link";
import { MediaPlaceholder, PageShell } from "../site-components";
import { displayDate, mediaUrl, pageMetadata, publishedProjects, setting } from "../../lib/public-cms";
import { editorPage } from "../../lib/editor-page";
import { VisualEditor } from "../visual-editor";
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

const defaults = {
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

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function Work({ searchParams }: Props) {
  const query = await searchParams;
  const projects = await publishedProjects();
  const stored = await setting("work", defaults);
  const general = await setting("general", {});
  const state = await editorPage("work", { ...defaults, ...stored, general }, query.preview === "1");
  const work = state.content;

  // `work.chapters` vient d'un JSON libre (cms_settings), sans passer par la
  // normalisation déjà appliquée aux galeries de projets (lib/public-cms.ts).
  // Une entrée `null`/`undefined` dans `chapters[i].media` faisait planter le
  // rendu de cette page (voir AUDIT_DIVINE_MOTION.md, correctif Phase 1 #2).
  // On normalise uniquement la copie utilisée pour l'affichage public ;
  // `work` (et donc l'état initial transmis à <VisualEditor>) n'est pas
  // modifié, pour ne rien changer au comportement de l'éditeur.
  // `includeHidden: true` conserve le comportement existant : cette page n'a
  // jamais filtré les médias marqués masqués.
  const chapters = (Array.isArray(work.chapters) ? work.chapters : []).map((chapter) =>
    normalizeChapterMedia(chapter, { includeHidden: true }),
  );

  return (
    <PageShell general={work.general}>
      <div className={state.edit ? "visual-editing" : ""}>
        <section className="page-hero dark-page" data-section-key="work-hero">
          <div className="wrap">
            <p className="eyebrow light" data-edit-key="eyebrow">{work.eyebrow}</p>
            <h1 data-edit-key="title">{work.title}</h1>
            <p data-edit-key="intro">{work.intro}</p>
          </div>
        </section>

        <section className="story-intro section wrap" data-section-key="story">
          <div>
            <p className="section-index" data-edit-key="storyLabel">{work.storyLabel}</p>
            <h2 data-edit-key="storyTitle">{work.storyTitle}</h2>
          </div>
          <div>
            <p className="story-date">{displayDate(work.storyDate)}</p>
            <p data-edit-key="storyText">{work.storyText}</p>
          </div>
        </section>

        <div data-media-key="storyCoverMediaId" data-alt-key="storyCoverAlt">
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

        <section className="story-flow wrap" data-section-key="chapters">
          {chapters.map((chapter: any, i: number) => (
            <article className={i % 2 ? "chapter reverse" : "chapter"} data-section-key={`work-chapter:${i}`} key={i}>
              <div className="chapter-copy">
                <span>0{i + 1}</span>
                <h2 data-edit-key={`chapters.${i}.title`}>{chapter.title}</h2>
                <p data-edit-key={`chapters.${i}.text`}>{chapter.text}</p>
              </div>
              <div className="chapter-media" data-gallery-key={`chapters.${i}.media`}>
                {chapter.media.length ? (
                  chapter.media.map((entry: any, j: number) => (
                    <figure
                      key={`${entry.id}-${j}`}
                      data-media-key={`chapters.${i}.media.${j}.id`}
                      data-alt-key={`chapters.${i}.media.${j}.alt`}
                    >
                      <img className="cms-image" src={mediaUrl(entry.id, "desktop")} alt={entry.alt || chapter.title} />
                      {entry.caption && (
                        <figcaption data-edit-key={`chapters.${i}.media.${j}.caption`}>{entry.caption}</figcaption>
                      )}
                    </figure>
                  ))
                ) : (
                  <div data-media-key={`chapters.${i}.media.0.id`}>
                    <MediaPlaceholder label={chapter.title} ratio={i === 2 || i === 3 ? "portrait" : "landscape"} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>

        <section className="section dark-section" id="film" data-section-key="film">
          <div className="wrap film-story">
            <div>
              <p className="section-index light">Le film</p>
              <h2 data-edit-key="filmTitle">{work.filmTitle}</h2>
            </div>
            <div className="film-frame" data-media-key="filmMediaId" data-media-types="video,external_video">
              <span className="play">▶</span>
            </div>
          </div>
        </section>

        {projects.length > 0 && (
          <section className="section wrap cms-project-index" data-section-key="projects">
            <div className="split-heading">
              <div>
                <p className="section-index">Histoires publiées</p>
                <h2 data-edit-key="projectsTitle">{work.projectsTitle}</h2>
              </div>
              <p data-edit-key="projectsIntro">{work.projectsIntro}</p>
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

        <section className="urban section wrap" data-section-key="urban">
          <div className="split-heading">
            <div>
              <p className="section-index" data-edit-key="urbanLabel">{work.urbanLabel}</p>
              <h2 data-edit-key="urbanTitle">{work.urbanTitle}</h2>
            </div>
            <p data-edit-key="urbanIntro">{work.urbanIntro}</p>
          </div>
          <div className="urban-grid" data-gallery-key="urbanGallery">
            {[0, 1, 2].map((i: number) => {
              const entry = work.urbanGallery?.[i];
              const id = typeof entry === "object" ? entry?.id : entry;
              return (
                <div key={i} data-media-key={`urbanGallery.${i}.id`} data-alt-key={`urbanGallery.${i}.alt`}>
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
            href={work.urbanCtaUrl}
            data-link-label-key="urbanCta"
            data-link-url-key="urbanCtaUrl"
          >
            <span data-edit-key="urbanCta">{work.urbanCta}</span>
          </Link>
        </section>
      </div>

      {state.user && (state.edit || state.preview) && (
        <VisualEditor
          pageKey="work"
          initial={work}
          media={state.media}
          preview={state.preview}
          editUrl="/notre-travail"
          previewUrl="/notre-travail?preview=1"
        />
      )}
    </PageShell>
  );
}
