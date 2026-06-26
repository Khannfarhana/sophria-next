import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { Providers } from "./providers";
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
  title: {
    default: "SophRia — Toronto's Premier Chauffeur Service",
    template: "%s — SophRia",
  },
  description: "Luxury chauffeur and limousine service in Toronto. Airport transfers, corporate travel, weddings, and hourly charter. Professional. Discreet. On time.",
  authors: [{ name: "SophRia" }],
  openGraph: {
    title: "SophRia — Toronto's Premier Chauffeur Service",
    description: "Luxury chauffeur and limousine service in Toronto.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230A0A0A'/%3E%3Ctext x='50' y='70' font-family='serif' font-size='70' font-weight='300' text-anchor='middle' fill='white'%3ES%3C/text%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${cormorant.variable}`}>
      <body className="bg-background text-foreground min-h-screen flex flex-col antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
