import { MessageCircle } from "lucide-react";
import { SITE } from "@/lib/site-config";

export function WhatsAppButton() {
  return (
    <a
      href={SITE.whatsappHref}
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition hover:scale-105"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
