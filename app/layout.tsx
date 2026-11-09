import type { Metadata } from "next";
import "./globals.css";
import "tldraw/tldraw.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "Huh",
  description: "Huh? What Happened Here?",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
