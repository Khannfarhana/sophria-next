import type { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { WhatsAppButton } from "./WhatsAppButton";
import { SplashLoader } from "./SplashLoader";

export function SiteLayout({
  children,
  solidNav = false,
}: {
  children: ReactNode;
  /** Use the solid/light navbar from the top — for pages without a dark hero (e.g. portals). */
  solidNav?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SplashLoader />
      <Navbar solid={solidNav} />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
