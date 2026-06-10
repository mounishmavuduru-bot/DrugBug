import type { Metadata, Viewport } from "next";
import { Poppins, Anonymous_Pro, Mulish } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Display — Poppins (brand wordmark + headings).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Body — Avenir is the brand face (loaded from the OS where present); Mulish is
// the web-hostable fallback with near-identical humanist-geometric proportions.
const mulish = Mulish({
  variable: "--font-avenir-fallback",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Data / mono — Anonymous Pro (drug names, doses, NDC, codes).
const anonymousPro = Anonymous_Pro({
  variable: "--font-anonymous-pro",
  subsets: ["latin"],
  weight: ["400", "700"],
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
      "A medication record that catches dangerous drug combinations, verifies your pills, and reads your pharmacogenomics.",
    siteName: "DrugBug",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "DrugBug — know what you take" },
};

export const viewport: Viewport = {
  themeColor: "#9b1e4d",
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
      className={`${poppins.variable} ${mulish.variable} ${anonymousPro.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
