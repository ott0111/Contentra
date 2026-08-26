import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: { default: "Contentra | Understand your content. Create what works.", template: "%s | Contentra" },
  description: "Contentra helps creators understand performance, manage content, and turn analytics into better content.",
  openGraph: { title: "Contentra | Understand your content. Create what works.", description: "A social media operating system for creators who want to learn from what they publish.", type: "website" },
  twitter: { card: "summary_large_image", title: "Contentra | Understand your content. Create what works.", description: "A social media operating system for creators." },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased"><body className="min-h-full">{children}</body></html>
  );
}
