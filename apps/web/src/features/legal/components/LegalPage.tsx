import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "../lib/legal-details";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const LEGAL_NAV = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Cookie Policy", href: "/cookie-policy" },
];

/**
 * Shared shell for the static legal pages. A server component with no client
 * JS — the pages are plain prose, so they add nothing to the storefront's
 * first-load bundle beyond the route's own HTML. Same column width and type
 * scale as /how-it-works.
 */
export function LegalPage({ title, intro, sections, current }: { title: string; intro: ReactNode; sections: LegalSection[]; current: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 md:py-14">
      <div className="mb-8 text-center md:mb-10">
        <h1 className="font-display text-3xl text-primary md:text-4xl">{title}</h1>
        <p className="mt-3 font-body text-xs text-text-secondary">Last updated: {LEGAL.lastUpdated}</p>
      </div>

      <div className="font-body text-sm leading-relaxed text-text-secondary">{intro}</div>

      <nav aria-label="On this page" className="mt-6 rounded-card border border-border bg-surface p-4">
        <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-text-primary">On this page</p>
        <ol className="list-decimal space-y-1 pl-5 font-body text-sm">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-text-secondary transition-colors hover:text-primary">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 flex flex-col gap-8">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-display text-lg text-text-primary">
              {index + 1}. {section.title}
            </h2>
            <div className="mt-2 space-y-3 font-body text-sm leading-relaxed text-text-secondary">{section.body}</div>
          </section>
        ))}
      </div>

      <nav aria-label="Legal" className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-border pt-6 font-body text-sm">
        {LEGAL_NAV.filter((link) => link.href !== current).map((link) => (
          <Link key={link.href} href={link.href} className="text-text-secondary transition-colors hover:text-primary">
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

/** Bulleted list with the storefront's text colours (Tailwind's preflight strips list styles). */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

/** Inline email link. */
export function MailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email.replace(/[[\]]/g, "")}`} className="text-primary hover:underline">
      {email}
    </a>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-text-primary">{children}</strong>;
}
