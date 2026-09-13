// Fonctions de normalisation par page pour V2 — prennent une donnée
// inconnue/partielle (un ancien brouillon, une valeur publiée, un brouillon
// délibérément incomplet) et garantissent une forme complète et sûre :
// tableaux toujours définis, chaînes/booléens essentiels jamais `undefined`.
//
// Motivation directe (voir CHANGELOG staging) : plusieurs incidents Worker
// 1101 sur V1 venaient d'un `.map()`/`.filter()` exécuté sur un champ absent
// d'un brouillon plus ancien qu'un champ récemment introduit. Normaliser une
// fois, à la frontière (chargement serveur), rend cette classe de bug
// impossible côté V2 plutôt que de semer des gardes `Array.isArray(...)`
// dispersées dans chaque composant.

import type { AboutContent, ContactContent, HomeContent, ServiceItem, ServicesContent, TeamMember, WorkChapter, WorkContent } from "./types";

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function nullableNum(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function array<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}
function record(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : fallback;
}
function input(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

const defaultOrder = ["manifest", "gallery", "services", "featured", "film", "approach", "beyond", "final"];

const homeContentDefaults: HomeContent = {
  heroType: "image",
  heroTitle: "Des histoires vraies. Des émotions intactes.",
  heroSubtitle: "Photographie & vidéographie pour préserver les moments que vous avez vécus — et ceux qui vous ont échappé.",
  heroMediaId: null,
  heroMediaAlt: "",
  heroMobileMediaId: null,
  heroFallbackMediaId: null,
  heroThumbnailMediaId: null,
  heroOverlay: 58,
  heroPosition: "center center",
  heroVisible: true,
  cta1: "Découvrir notre travail",
  cta1Url: "/notre-travail",
  cta2: "Vérifier notre disponibilité",
  cta2Url: "/contact",
  manifestTitle: "Votre journée passe vite. Vos souvenirs ne devraient pas.",
  manifestText: "Les regards échangés, les éclats de rire, les gestes discrets et les émotions inattendues font partie de ces moments qui passent parfois en quelques secondes.",
  gallery: [],
  featuredProjectId: null,
  approachTitle: "Présents quand il le faut. Discrets quand il le faut.",
  approachText: "Notre approche privilégie les moments naturels.",
  principles: [],
  servicesHeading: "Une histoire. Plusieurs façons de la revivre.",
  servicesIntro: "Le mariage est au cœur de notre univers.",
  services: [],
  featuredLabel: "Histoire à la une",
  featuredFallbackText: "Une journée remplie d’émotion, de foi, de famille et de célébration.",
  filmTitle: "Certaines émotions méritent plus qu’une photographie.",
  filmCta: "Voir le film",
  filmCtaUrl: "/notre-travail#film",
  filmMediaId: null,
  beyondTitle: "Au-delà du mariage",
  beyondText: "Chaque histoire ne commence pas devant un autel.",
  beyondItems: [],
  finalTitle: "Votre histoire pourrait être la prochaine.",
  finalText: "Parlez-nous de votre projet.",
  finalCta: "Vérifier notre disponibilité",
  finalCtaUrl: "/contact",
  sectionOrder: defaultOrder,
  hiddenSections: [],
  sectionSettings: {},
  customSections: [],
};

export function normalizeHomeContent(raw: unknown): HomeContent {
  const v = input(raw);
  return {
    heroType: v.heroType === "video" ? "video" : "image",
    heroTitle: str(v.heroTitle, homeContentDefaults.heroTitle),
    heroSubtitle: str(v.heroSubtitle, homeContentDefaults.heroSubtitle),
    heroMediaId: nullableNum(v.heroMediaId, homeContentDefaults.heroMediaId),
    heroMediaAlt: str(v.heroMediaAlt, homeContentDefaults.heroMediaAlt),
    heroMobileMediaId: nullableNum(v.heroMobileMediaId, homeContentDefaults.heroMobileMediaId),
    heroFallbackMediaId: nullableNum(v.heroFallbackMediaId, homeContentDefaults.heroFallbackMediaId),
    heroThumbnailMediaId: nullableNum(v.heroThumbnailMediaId, homeContentDefaults.heroThumbnailMediaId),
    heroOverlay: num(v.heroOverlay, homeContentDefaults.heroOverlay),
    heroPosition: str(v.heroPosition, homeContentDefaults.heroPosition),
    heroVisible: bool(v.heroVisible, homeContentDefaults.heroVisible),
    cta1: str(v.cta1, homeContentDefaults.cta1),
    cta1Url: str(v.cta1Url, homeContentDefaults.cta1Url),
    cta2: str(v.cta2, homeContentDefaults.cta2),
    cta2Url: str(v.cta2Url, homeContentDefaults.cta2Url),
    manifestTitle: str(v.manifestTitle, homeContentDefaults.manifestTitle),
    manifestText: str(v.manifestText, homeContentDefaults.manifestText),
    gallery: array(v.gallery, homeContentDefaults.gallery),
    featuredProjectId: nullableNum(v.featuredProjectId, homeContentDefaults.featuredProjectId),
    approachTitle: str(v.approachTitle, homeContentDefaults.approachTitle),
    approachText: str(v.approachText, homeContentDefaults.approachText),
    principles: array(v.principles, homeContentDefaults.principles),
    servicesHeading: str(v.servicesHeading, homeContentDefaults.servicesHeading),
    servicesIntro: str(v.servicesIntro, homeContentDefaults.servicesIntro),
    services: array(v.services, homeContentDefaults.services),
    featuredLabel: str(v.featuredLabel, homeContentDefaults.featuredLabel),
    featuredFallbackText: str(v.featuredFallbackText, homeContentDefaults.featuredFallbackText),
    filmTitle: str(v.filmTitle, homeContentDefaults.filmTitle),
    filmCta: str(v.filmCta, homeContentDefaults.filmCta),
    filmCtaUrl: str(v.filmCtaUrl, homeContentDefaults.filmCtaUrl),
    filmMediaId: nullableNum(v.filmMediaId, homeContentDefaults.filmMediaId ?? null),
    beyondTitle: str(v.beyondTitle, homeContentDefaults.beyondTitle),
    beyondText: str(v.beyondText, homeContentDefaults.beyondText),
    beyondItems: array(v.beyondItems, homeContentDefaults.beyondItems),
    finalTitle: str(v.finalTitle, homeContentDefaults.finalTitle),
    finalText: str(v.finalText, homeContentDefaults.finalText),
    finalCta: str(v.finalCta, homeContentDefaults.finalCta),
    finalCtaUrl: str(v.finalCtaUrl, homeContentDefaults.finalCtaUrl),
    sectionOrder: array(v.sectionOrder, homeContentDefaults.sectionOrder),
    hiddenSections: array(v.hiddenSections, homeContentDefaults.hiddenSections),
    sectionSettings: record(v.sectionSettings, homeContentDefaults.sectionSettings),
    customSections: array(v.customSections, homeContentDefaults.customSections),
    general: record(v.general, {}),
  };
}

const workContentDefaults: WorkContent = {
  eyebrow: "Portfolio éditorial",
  title: "Notre travail",
  intro: "Nous ne cherchons pas seulement les belles images.",
  storyLabel: "Histoire 01 · Mariage",
  storyTitle: "David & Emmanuella",
  storyDate: "2026-08-08",
  storyText: "Une journée remplie d’émotion, de foi, de famille et de célébration.",
  storyCoverMediaId: null,
  storyCoverAlt: "David & Emmanuella",
  chapters: [],
  filmTitle: "Revivre les voix, les gestes, l’atmosphère.",
  filmMediaId: null,
  projectsTitle: "De nouvelles histoires, au fil du temps.",
  projectsIntro: "Chaque projet publié depuis l’espace Divine Motion rejoint automatiquement cette collection.",
  urbanLabel: "Portraits & lifestyle",
  urbanTitle: "Dans la ville",
  urbanIntro: "Portraits, mouvement et lumière naturelle.",
  urbanGallery: [],
  urbanCta: "Imaginer votre séance",
  urbanCtaUrl: "/contact?type=shooting",
  sectionOrder: ["story", "chapters", "film", "projects", "urban"],
  hiddenSections: [],
  customSections: [],
};

function normalizeChapter(raw: unknown): WorkChapter {
  const v = input(raw);
  return { title: str(v.title, ""), text: str(v.text, ""), media: array(v.media, []) };
}

export function normalizeWorkContent(raw: unknown): WorkContent {
  const v = input(raw);
  return {
    eyebrow: str(v.eyebrow, workContentDefaults.eyebrow),
    title: str(v.title, workContentDefaults.title),
    intro: str(v.intro, workContentDefaults.intro),
    storyLabel: str(v.storyLabel, workContentDefaults.storyLabel),
    storyTitle: str(v.storyTitle, workContentDefaults.storyTitle),
    storyDate: str(v.storyDate, workContentDefaults.storyDate),
    storyText: str(v.storyText, workContentDefaults.storyText),
    storyCoverMediaId: nullableNum(v.storyCoverMediaId, workContentDefaults.storyCoverMediaId),
    storyCoverAlt: str(v.storyCoverAlt, workContentDefaults.storyCoverAlt),
    chapters: array(v.chapters, []).map(normalizeChapter),
    filmTitle: str(v.filmTitle, workContentDefaults.filmTitle),
    filmMediaId: nullableNum(v.filmMediaId, workContentDefaults.filmMediaId),
    projectsTitle: str(v.projectsTitle, workContentDefaults.projectsTitle),
    projectsIntro: str(v.projectsIntro, workContentDefaults.projectsIntro),
    urbanLabel: str(v.urbanLabel, workContentDefaults.urbanLabel),
    urbanTitle: str(v.urbanTitle, workContentDefaults.urbanTitle),
    urbanIntro: str(v.urbanIntro, workContentDefaults.urbanIntro),
    urbanGallery: array(v.urbanGallery, workContentDefaults.urbanGallery),
    urbanCta: str(v.urbanCta, workContentDefaults.urbanCta),
    urbanCtaUrl: str(v.urbanCtaUrl, workContentDefaults.urbanCtaUrl),
    sectionOrder: array(v.sectionOrder, workContentDefaults.sectionOrder),
    hiddenSections: array(v.hiddenSections, workContentDefaults.hiddenSections),
    customSections: array(v.customSections, workContentDefaults.customSections),
    general: record(v.general, {}),
  };
}

const servicesContentDefaults: ServicesContent = {
  eyebrow: "Nos prestations",
  title: "Des images pour les histoires qui comptent.",
  weddingLabel: "Univers 01 — Mariages",
  weddingTitle: "Votre journée. Votre histoire.",
  weddingIntro: "Un récit construit avec soin.",
  otherLabel: "Univers 02 — Autres histoires",
  otherTitle: "Parce qu’il n’y a pas que les mariages que l’on souhaite se rappeler.",
  valuesTitle: "Ce qui compte pour nous",
  values: [],
  services: [],
  sectionOrder: ["wedding-services", "other-services", "values"],
  hiddenSections: [],
  customSections: [],
};

function normalizeServiceItem(raw: unknown): ServiceItem {
  const v = input(raw);
  return {
    id: typeof v.id === "number" ? v.id : undefined,
    name: str(v.name, ""),
    category: str(v.category, ""),
    description: str(v.description, ""),
    cta: str(v.cta, ""),
    ctaUrl: typeof v.ctaUrl === "string" ? v.ctaUrl : undefined,
    cta_url: typeof v.cta_url === "string" ? v.cta_url : undefined,
    visible: v.visible !== false,
    displayOrder: num(v.displayOrder, 0),
  };
}

export function normalizeServicesContent(raw: unknown): ServicesContent {
  const v = input(raw);
  return {
    eyebrow: str(v.eyebrow, servicesContentDefaults.eyebrow),
    title: str(v.title, servicesContentDefaults.title),
    weddingLabel: str(v.weddingLabel, servicesContentDefaults.weddingLabel),
    weddingTitle: str(v.weddingTitle, servicesContentDefaults.weddingTitle),
    weddingIntro: str(v.weddingIntro, servicesContentDefaults.weddingIntro),
    otherLabel: str(v.otherLabel, servicesContentDefaults.otherLabel),
    otherTitle: str(v.otherTitle, servicesContentDefaults.otherTitle),
    valuesTitle: str(v.valuesTitle, servicesContentDefaults.valuesTitle),
    values: array(v.values, servicesContentDefaults.values),
    services: array(v.services, []).map(normalizeServiceItem),
    sectionOrder: array(v.sectionOrder, servicesContentDefaults.sectionOrder),
    hiddenSections: array(v.hiddenSections, servicesContentDefaults.hiddenSections),
    customSections: array(v.customSections, servicesContentDefaults.customSections),
    general: record(v.general, {}),
  };
}

const aboutContentDefaults: AboutContent = {
  eyebrow: "L’histoire derrière les images",
  title: "Derrière Divine Motion",
  startLabel: "Notre point de départ",
  intro: "Une photographie peut figer un instant. Un film peut lui redonner vie.",
  startText: "Divine Motion est né de l’envie de réunir photographie et film.",
  mainMediaId: null,
  mainMediaAlt: "",
  visionLabel: "Notre manière de voir les choses",
  manifest: "Nous croyons que les souvenirs les plus précieux ne sont pas toujours les plus planifiés.",
  values: [],
  teamTitle: "Les personnes derrière le regard",
  team: [],
  finalEyebrow: "Faisons connaissance",
  finalTitle: "Une histoire commence par une conversation.",
  cta: "Parler de votre projet",
  ctaUrl: "/contact",
  sectionOrder: ["about-lead", "about-image", "vision", "team", "values", "final"],
  hiddenSections: [],
  customSections: [],
};

function normalizeTeamMember(raw: unknown): TeamMember {
  const v = input(raw);
  return {
    id: typeof v.id === "number" ? v.id : undefined,
    firstName: str(v.firstName, ""),
    lastName: str(v.lastName, ""),
    role: str(v.role, ""),
    bio: str(v.bio, ""),
    photoMediaId: nullableNum(v.photoMediaId, null),
    photoAlt: typeof v.photoAlt === "string" ? v.photoAlt : undefined,
    visible: v.visible !== false,
    displayOrder: num(v.displayOrder, 0),
  };
}

export function normalizeAboutContent(raw: unknown): AboutContent {
  const v = input(raw);
  return {
    eyebrow: str(v.eyebrow, aboutContentDefaults.eyebrow),
    title: str(v.title, aboutContentDefaults.title),
    startLabel: str(v.startLabel, aboutContentDefaults.startLabel),
    intro: str(v.intro, aboutContentDefaults.intro),
    startText: str(v.startText, aboutContentDefaults.startText),
    mainMediaId: nullableNum(v.mainMediaId, aboutContentDefaults.mainMediaId),
    mainMediaAlt: str(v.mainMediaAlt, aboutContentDefaults.mainMediaAlt ?? ""),
    visionLabel: str(v.visionLabel, aboutContentDefaults.visionLabel),
    manifest: str(v.manifest, aboutContentDefaults.manifest),
    values: array(v.values, aboutContentDefaults.values),
    teamTitle: str(v.teamTitle, aboutContentDefaults.teamTitle),
    team: array(v.team, []).map(normalizeTeamMember),
    finalEyebrow: str(v.finalEyebrow, aboutContentDefaults.finalEyebrow),
    finalTitle: str(v.finalTitle, aboutContentDefaults.finalTitle),
    cta: str(v.cta, aboutContentDefaults.cta),
    ctaUrl: str(v.ctaUrl, aboutContentDefaults.ctaUrl),
    sectionOrder: array(v.sectionOrder, aboutContentDefaults.sectionOrder),
    hiddenSections: array(v.hiddenSections, aboutContentDefaults.hiddenSections),
    customSections: array(v.customSections, aboutContentDefaults.customSections),
    general: record(v.general, {}),
  };
}

const contactContentDefaults: ContactContent = {
  eyebrow: "Réserver · Contact",
  title: "Racontez-nous votre histoire.",
  intro: "Chaque projet est différent.",
  asideTitle: "Une première conversation",
  asideText: "Choisissez le type de projet.",
  zoneLabel: "Zone principale",
  zone: "Québec · Ottawa",
  travelLabel: "Déplacements",
  travel: "Disponible pour voyager",
  sectionOrder: ["contact-form"],
  hiddenSections: [],
  customSections: [],
};

export function normalizeContactContent(raw: unknown): ContactContent {
  const v = input(raw);
  return {
    eyebrow: str(v.eyebrow, contactContentDefaults.eyebrow),
    title: str(v.title, contactContentDefaults.title),
    intro: str(v.intro, contactContentDefaults.intro),
    asideTitle: str(v.asideTitle, contactContentDefaults.asideTitle),
    asideText: str(v.asideText, contactContentDefaults.asideText),
    zoneLabel: str(v.zoneLabel, contactContentDefaults.zoneLabel),
    zone: str(v.zone, contactContentDefaults.zone),
    travelLabel: str(v.travelLabel, contactContentDefaults.travelLabel),
    travel: str(v.travel, contactContentDefaults.travel),
    sectionOrder: array(v.sectionOrder, contactContentDefaults.sectionOrder),
    hiddenSections: array(v.hiddenSections, contactContentDefaults.hiddenSections),
    customSections: array(v.customSections, contactContentDefaults.customSections),
    general: record(v.general, {}),
  };
}
