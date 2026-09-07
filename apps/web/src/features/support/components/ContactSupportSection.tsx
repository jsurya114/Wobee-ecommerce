import { Card } from "@woobe/ui";
import { Mail, MessageCircle } from "lucide-react";
import { buildWhatsAppHref } from "../lib/whatsapp";

/** Same address `AccountView`'s old direct-mailto link and `SiteFooter`'s "Contact us" already use — kept, not replaced. */
const SUPPORT_EMAIL = "hello@woobe.in";

/**
 * "Contact Support" — reuses the exact existing channels (this codebase's
 * `mailto:hello@woobe.in` and the WhatsApp click-to-chat link already built
 * for the floating WhatsApp button, `buildWhatsAppHref`) rather than
 * inventing a new contact mechanism. The direct-email capability the old
 * Account → Help & Support link had is preserved here, just one tap deeper
 * instead of the immediate action.
 */
export function ContactSupportSection() {
  const whatsappHref = buildWhatsAppHref("Hi Woobe, I need help with my order.");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg text-text-primary">Contact Support</h2>
        <p className="mt-1 font-body text-sm text-text-secondary">We&apos;re here to help with anything not covered above.</p>
      </div>
      <div className="flex flex-col gap-3">
        <a href={`mailto:${SUPPORT_EMAIL}`} className="block">
          <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary">
            <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-body text-sm font-medium text-text-primary">Email us</span>
              <span className="block truncate font-body text-xs text-text-secondary">{SUPPORT_EMAIL}</span>
            </span>
          </Card>
        </a>
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="block">
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary">
              <MessageCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block font-body text-sm font-medium text-text-primary">WhatsApp us</span>
                <span className="block font-body text-xs text-text-secondary">Chat with our support team</span>
              </span>
            </Card>
          </a>
        ) : null}
      </div>
    </div>
  );
}
