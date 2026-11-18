import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, MailLink, Strong, type LegalSection } from "@/features/legal/components/LegalPage";
import { LEGAL } from "@/features/legal/lib/legal-details";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "The cookies and browser storage Woobe uses, why, and how to control them.",
  alternates: { canonical: "/cookie-policy" },
};

interface StorageItem {
  name: string;
  type: string;
  purpose: string;
  duration: string;
}

/**
 * The complete list, taken from the code — update it when one is added:
 *  - refresh_token: apps/api auth/interface/http/refresh-cookie.ts (expiry = JWT_REFRESH_TOKEN_TTL, 30d)
 *  - cart_id: apps/api cart/interface/http/cart-cookie.ts (30 days)
 *  - woobe_sid: apps/web src/lib/analytics.ts (sessionStorage, skipped under Do-Not-Track)
 *  - woobe.guestLoginPromptDismissed: apps/web auth/hooks/useGuestLoginPrompt.ts (sessionStorage)
 *  - Razorpay / Google: third-party scripts loaded only at payment / Google sign-in.
 * The admin panel's own admin_refresh_token cookie is staff-only and not listed.
 */
const FIRST_PARTY: StorageItem[] = [
  {
    name: "refresh_token",
    type: "Cookie (strictly necessary)",
    purpose: "Keeps you signed in securely. HttpOnly, Secure and signed, so scripts on the page cannot read or alter it.",
    duration: "Up to 30 days, or until you log out",
  },
  {
    name: "cart_id",
    type: "Cookie (strictly necessary)",
    purpose: "Remembers the items in your bag, including before you sign in. HttpOnly, Secure and signed.",
    duration: "30 days",
  },
  {
    name: "woobe_sid",
    type: "Session storage (analytics)",
    purpose:
      "A random ID for this tab session used to count anonymous shopping steps (visit, product view, add to bag, checkout). Contains no personal data. Not set if your browser sends Do Not Track.",
    duration: "Until you close the tab",
  },
  {
    name: "woobe.guestLoginPromptDismissed",
    type: "Session storage (preference)",
    purpose: "Remembers that you closed the sign-in suggestion so we don't show it again.",
    duration: "Until you close the tab",
  },
];

function StorageTable({ items }: { items: StorageItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.name} className="rounded-card border border-border bg-surface p-4">
          <p className="font-mono text-xs font-semibold text-text-primary">{item.name}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{item.type}</p>
          <p className="mt-2">{item.purpose}</p>
          <p className="mt-1 text-xs">
            <Strong>Duration:</Strong> {item.duration}
          </p>
        </div>
      ))}
    </div>
  );
}

const SECTIONS: LegalSection[] = [
  {
    id: "what-are-cookies",
    title: "What cookies and browser storage are",
    body: (
      <p>
        Cookies are small text files a website stores in your browser. Session storage is similar, but is kept only for the browser tab you
        are using and is deleted when you close it. We use both, sparingly, to make Woobe work. This policy applies to {LEGAL.siteDomain} and is
        part of our{" "}
        <Link href="/privacy-policy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "what-we-use",
    title: "What we use",
    body: (
      <>
        <p>This is the complete list of cookies and browser storage Woobe itself sets on the storefront:</p>
        <StorageTable items={FIRST_PARTY} />
        <p>
          We do <Strong>not</Strong> use advertising cookies, cross-site tracking, social media pixels or third-party analytics. Your sign-in
          access token is kept only in the page&apos;s memory, never in cookies or local storage.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party cookies",
    body: (
      <>
        <p>Some features load a trusted provider&apos;s code, which may set its own cookies under that provider&apos;s policy:</p>
        <LegalList>
          <li>
            <Strong>Razorpay</Strong> — loaded only when you pay online, to run the secure payment window, prevent fraud and complete your
            payment.
          </li>
          <li>
            <Strong>Google Sign-In</Strong> — loaded on the login and register pages when &ldquo;Continue with Google&rdquo; is available, to
            sign you in with your Google account.
          </li>
        </LegalList>
        <p>We do not control these cookies; please see Razorpay&apos;s and Google&apos;s own privacy and cookie policies.</p>
      </>
    ),
  },
  {
    id: "consent",
    title: "Why we don't show a cookie banner",
    body: (
      <p>
        The cookies we set are strictly necessary to provide the service you ask for — staying signed in and keeping your bag — and our
        analytics is anonymous, session-only and honours Do Not Track. We therefore don&apos;t ask for separate consent for them. If we ever add
        cookies that are not strictly necessary, such as for advertising, we will ask for your consent first and update this policy.
      </p>
    ),
  },
  {
    id: "control",
    title: "How to control cookies",
    body: (
      <>
        <p>
          You can block or delete cookies and site data in your browser settings. If you block Woobe&apos;s cookies, you won&apos;t be able to
          stay signed in or keep items in your bag, and checkout may not work.
        </p>
        <p>
          To stop anonymous analytics, turn on your browser&apos;s &ldquo;Do Not Track&rdquo; setting, or close the tab to clear session
          storage.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about this policy? Write to <MailLink email={LEGAL.supportEmail} /> or our Grievance Officer at{" "}
        <MailLink email={LEGAL.grievanceOfficerEmail} />.
      </p>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      current="/cookie-policy"
      sections={SECTIONS}
      intro={<p>Woobe uses only a handful of cookies, all of them needed to run the store. Here&apos;s exactly what they are.</p>}
    />
  );
}
