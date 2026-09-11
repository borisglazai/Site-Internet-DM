import type { Metadata } from "next";
import "./globals.css";
// visual-editor.css n'est chargé que par app/admin/editor/layout.tsx : le
// site public ne doit jamais recevoir le CSS ni les affordances de l'éditeur
// (voir app/admin/editor/layout.tsx).

export const metadata: Metadata = {
  metadataBase: new URL("https://divine-motion-studio.chatgpt.site"),
  title: { default: "Divine Motion | Photographie & Vidéographie", template: "%s | Divine Motion" },
  description: "Divine Motion raconte vos histoires à travers la photographie et la vidéographie : mariages, portraits, shootings et événements.",
  keywords: ["photographe mariage Québec", "vidéographe mariage Québec", "photographe mariage Ottawa", "vidéographe mariage Ottawa", "photographe portrait", "shooting photo", "photographe anniversaire", "photographe événementiel"],
  openGraph: { title: "Divine Motion | Photographie & Vidéographie", description: "Des histoires vraies. Des émotions intactes.", images: ["/og.png"], type: "website", locale: "fr_CA" },
  twitter: { card: "summary_large_image", title: "Divine Motion | Photographie & Vidéographie", description: "Des histoires vraies. Des émotions intactes.", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
