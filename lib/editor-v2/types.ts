// Types de contenu par page pour l'éditeur V2 — remplacent progressivement
// le `Record<string, any>` généralisé de V1 (voir l'audit V2). Chaque forme
// reflète exactement les valeurs par défaut déjà définies dans les pages
// publiques (app/page.tsx, app/notre-travail/page.tsx, ...) : ce ne sont pas
// de nouveaux champs, seulement leur typage explicite.
//
// Portée volontairement limitée à cette phase (V2.1, fondation) : les pages
// publiques restent la source de vérité de la forme des données. Migrer
// entièrement l'application vers ces types est un chantier séparé.

export type PageKey = "home" | "work" | "services" | "about" | "contact";

export interface HomeContent {
  heroType: "image" | "video";
  heroTitle: string;
  heroSubtitle: string;
  heroMediaId: number | null;
  heroMediaAlt: string;
  heroMobileMediaId: number | null;
  heroFallbackMediaId: number | null;
  heroThumbnailMediaId: number | null;
  heroOverlay: number;
  heroPosition: string;
  heroVisible: boolean;
  cta1: string;
  cta1Url: string;
  cta2: string;
  cta2Url: string;
  manifestTitle: string;
  manifestText: string;
  gallery: Array<number | { id: number; alt?: string }>;
  featuredProjectId: number | null;
  approachTitle: string;
  approachText: string;
  principles: Array<{ title: string; text: string }>;
  servicesHeading: string;
  servicesIntro: string;
  services: Array<{ title: string; text: string; cta: string; href: string }>;
  featuredLabel: string;
  featuredFallbackText: string;
  filmTitle: string;
  filmCta: string;
  filmCtaUrl: string;
  filmMediaId?: number | null;
  beyondTitle: string;
  beyondText: string;
  beyondItems: Array<{ title: string; text: string }>;
  finalTitle: string;
  finalText: string;
  finalCta: string;
  finalCtaUrl: string;
  sectionOrder: string[];
  hiddenSections: string[];
  sectionSettings: Record<string, unknown>;
  customSections: Array<Record<string, unknown>>;
  general?: Record<string, unknown>;
}

export interface WorkChapter {
  title: string;
  text: string;
  media: Array<{ id: number; alt?: string; caption?: string }>;
}

export interface WorkContent {
  eyebrow: string;
  title: string;
  intro: string;
  storyLabel: string;
  storyTitle: string;
  storyDate: string;
  storyText: string;
  storyCoverMediaId: number | null;
  storyCoverAlt: string;
  chapters: WorkChapter[];
  filmTitle: string;
  filmMediaId: number | null;
  projectsTitle: string;
  projectsIntro: string;
  urbanLabel: string;
  urbanTitle: string;
  urbanIntro: string;
  urbanGallery: Array<number | { id: number; alt?: string }>;
  urbanCta: string;
  urbanCtaUrl: string;
  sectionOrder: string[];
  hiddenSections: string[];
  customSections: Array<Record<string, unknown>>;
  general?: Record<string, unknown>;
}

export interface ServiceItem {
  id?: number;
  name: string;
  category: string;
  description: string;
  cta: string;
  ctaUrl?: string;
  cta_url?: string;
  visible?: boolean;
  displayOrder?: number;
}

export interface ServicesContent {
  eyebrow: string;
  title: string;
  weddingLabel: string;
  weddingTitle: string;
  weddingIntro: string;
  otherLabel: string;
  otherTitle: string;
  valuesTitle: string;
  values: string[];
  services: ServiceItem[];
  sectionOrder: string[];
  hiddenSections: string[];
  customSections: Array<Record<string, unknown>>;
  general?: Record<string, unknown>;
}

export interface TeamMember {
  id?: number;
  firstName: string;
  lastName: string;
  role: string;
  bio: string;
  photoMediaId: number | null;
  photoAlt?: string;
  visible?: boolean;
  displayOrder?: number;
}

export interface AboutContent {
  eyebrow: string;
  title: string;
  startLabel: string;
  intro: string;
  startText: string;
  mainMediaId: number | null;
  mainMediaAlt?: string;
  visionLabel: string;
  manifest: string;
  values: string[];
  teamTitle: string;
  team: TeamMember[];
  finalEyebrow: string;
  finalTitle: string;
  cta: string;
  ctaUrl: string;
  sectionOrder: string[];
  hiddenSections: string[];
  customSections: Array<Record<string, unknown>>;
  general?: Record<string, unknown>;
}

export interface ContactContent {
  eyebrow: string;
  title: string;
  intro: string;
  asideTitle: string;
  asideText: string;
  zoneLabel: string;
  zone: string;
  travelLabel: string;
  travel: string;
  sectionOrder: string[];
  hiddenSections: string[];
  customSections: Array<Record<string, unknown>>;
  general?: Record<string, unknown>;
}

export type PageContent = HomeContent | WorkContent | ServicesContent | AboutContent | ContactContent;
