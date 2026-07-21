import Link from "next/link";
import { MessageCircle, Phone, Mail } from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { SITE } from "@/lib/site-config";

export function Footer() {
  return (
    <footer className="bg-night text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 md:gap-12">
          <div className="col-span-2">
            <BrandMark full className="flex-wrap text-3xl" />
            <p className="mt-4 max-w-sm text-sm text-white/60">
              {SITE.tagline} Discreet. Punctual. Effortless.
            </p>
            <p className="mt-2 max-w-sm text-xs text-white/45">
              Serving the {SITE.serviceArea}.
            </p>
            {/* Real contact channels — social profiles can join once they exist. */}
            <div className="mt-6 flex gap-3">
              <a
                href={SITE.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-gold hover:text-gold"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              <a
                href={SITE.phoneHref}
                aria-label={`Call ${SITE.phone}`}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-gold hover:text-gold"
              >
                <Phone className="h-5 w-5" />
              </a>
              <a
                href={SITE.emailHref}
                aria-label={`Email ${SITE.email}`}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-gold hover:text-gold"
              >
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-4">Company</div>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="text-white/70 hover:text-white">About</Link></li>
              <li><Link href="/fleet" className="text-white/70 hover:text-white">Fleet</Link></li>
              <li><Link href="/services" className="text-white/70 hover:text-white">Services</Link></li>
              <li><Link href="/pricing" className="text-white/70 hover:text-white">Pricing</Link></li>
              <li><Link href="/become-chauffeur" className="text-white/70 hover:text-white">Become a Chauffeur</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-4">Contact</div>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <address className="not-italic leading-relaxed">
                  {SITE.address.line1}
                  <br />
                  {SITE.address.line2}
                  <br />
                  {SITE.address.country}
                </address>
              </li>
              <li><a href={SITE.phoneHref} className="hover:text-white">{SITE.phone}</a></li>
              <li><a href={SITE.emailHref} className="hover:text-white">{SITE.email}</a></li>
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/40 md:flex-row md:items-center">
          <div>© {new Date().getFullYear()} {SITE.fullName}. All rights reserved.</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/terms" className="hover:text-white/70">Terms</Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
            <span aria-hidden>·</span>
            <Link href="/refund-policy" className="hover:text-white/70">Refunds</Link>
            <span aria-hidden>·</span>
            <Link href="/chauffeur-terms" className="hover:text-white/70">Chauffeur Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
