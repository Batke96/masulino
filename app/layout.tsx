import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Masulino · Dein Spielraum",
  description: "Dein Tag, deine Apps und ein Team aus hilfreichen Agenten. Interaktiver Masulino ERP-Prototyp.",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
