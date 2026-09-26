import Providers from "@/components/providers";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "allotment/dist/style.css";
// Streamdown v2 ships its streaming animations as a separate stylesheet
// (v1 had no such export); without it, code/markdown blocks render but
// the fade/slide-in transitions never play.
import "streamdown/styles.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Anubithic/Studio | Browser-Based AI Code Editor",
  description:
    "Anubithic Studio is a cloud-based AI code editor that lets you build, edit, and deploy web applications directly from your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${plexMono.variable} antialiased`}>
        <Providers>
          {children}
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
