import type { Metadata } from "next";
import "./globals.css";
import "tldraw/tldraw.css";
import "katex/dist/katex.min.css";
import { THEME_BOOT_SCRIPT } from "@/lib/themeBoot";

export const metadata: Metadata = {
  title: "Huh",
  description: "Huh? What Happened Here?",
  // Unlisted classmate demo: keep it out of search engines for now.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies System / Light / Dark before the first paint (E5). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
