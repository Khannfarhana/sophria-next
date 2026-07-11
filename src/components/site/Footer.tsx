import Link from "next/link";
import { Instagram, Facebook, Twitter, Linkedin } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#101010] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 md:gap-12">
          <div className="col-span-2">
            <div className="font-display text-3xl tracking-wide">SophRia</div>
            <p className="mt-4 max-w-sm text-sm text-white/60">
              Luxury limousine &amp; chauffeur services. Discreet. Punctual. Effortless.
            </p>
            <p className="mt-2 max-w-sm text-xs text-white/45">
              Serving Toronto, Hamilton, Burlington, Oakville, Mississauga, Niagara Region &amp; Southern Ontario.
            </p>
            <div className="mt-6 flex gap-4">
              {[Instagram, Facebook, Twitter, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white hover:text-[#101010]">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
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
              <li>Toronto &amp; Southern Ontario, Canada</li>
              <li><a href="tel:+14379672334" className="hover:text-white">+1 (437) 967-2334</a></li>
              <li><a href="mailto:hello@sophria.com" className="hover:text-white">hello@sophria.com</a></li>
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/40 md:flex-row md:items-center">
          <div>© {new Date().getFullYear()} SophRia. All rights reserved.</div>
          <div>Toronto · Ontario · Canada</div>
        </div>
      </div>
    </footer>
  );
}
