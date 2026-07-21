import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { Providers } from "./providers";
import { SITE } from "@/lib/site-config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://sophria.ca"),
  title: {
    default: `${SITE.fullName} — Chauffeur Service in the Greater Toronto Area`,
    template: `%s — ${SITE.fullName}`,
  },
  description:
    "Luxury chauffeur and limousine service across the Greater Toronto Area and across the border. Airport transfers, corporate travel, weddings, and hourly charter. Professional. Discreet. On time.",
  authors: [{ name: SITE.fullName }],
  openGraph: {
    title: `${SITE.fullName} — Chauffeur Service in the Greater Toronto Area`,
    description: `Luxury limousine & chauffeur services across the ${SITE.serviceArea}.`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="bg-background text-foreground min-h-screen flex flex-col antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
