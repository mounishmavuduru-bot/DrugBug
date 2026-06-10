import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Editorial serif display — distinctive, authoritative, not a sans-everywhere app.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

// Clinical workhorse body — official, legible, deliberately not Inter.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Prescription-label monospace for drug names, doses, NDC codes.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DrugBug — know what you take",
  description:
    "Tracks your medications and dose times, then warns you before a combination, a counterfeit, or your own genetics turns a routine prescription dangerous.",
  applicationName: "DrugBug",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "DrugBug" },
  openGraph: {
    title: "DrugBug — know what you take",
    description:
      "A medication record that catches dangerous drug combinations, verifies your pills, and reads your pharmacogenomics — built for people on more than one prescription.",
    siteName: "DrugBug",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "DrugBug — know what you take" },
};

export const viewport: Viewport = {
  themeColor: "#15402e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
