import { SITE } from "@/lib/site-config";

/**
 * The SophRia wordmark.
 *
 * The client asked three times (14 Jul) for the brand to read "SophRia
 * Limousine Services" in bold rather than just "SophRia", and to use the logo
 * "if it looks good". THERE IS NO LOGO ASSET IN THE REPO — public/ contains only
 * the untouched Next.js starter SVGs, and the favicon is an inline data-URI
 * letter "S". Once the client supplies the file, drop it in public/ and render
 * it in the slot marked below; nothing else needs to move.
 *
 * `full` renders the complete name. The developer's concern on the call was
 * that it's too long for the navbar, which is fair at small widths — so the
 * "Limousine Services" half is hidden below `sm` there rather than dropped.
 */
export function BrandMark({
  full = false,
  className = "",
  subClassName = "",
}: {
  /** Show "Limousine Services" alongside the mark. */
  full?: boolean;
  className?: string;
  /** Extra classes for the "Limousine Services" half (e.g. responsive hiding). */
  subClassName?: string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      {/* Logo slot — drop <Image src="/logo.svg" … /> here when the asset lands. */}
      <span className="font-display font-semibold tracking-wide">{SITE.name}</span>
      {full && (
        <span className={`font-display font-semibold tracking-wide ${subClassName}`}>
          Limousine Services
        </span>
      )}
    </span>
  );
}
