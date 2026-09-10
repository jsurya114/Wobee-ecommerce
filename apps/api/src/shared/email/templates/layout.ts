import { env } from "../../../config/env";

/**
 * The ONE branded shell every transactional email is rendered through — so
 * per-email templates only ever author the body fragment, never the
 * header/footer/wrapper chrome, and the branding can't drift between them.
 *
 * Constraints that shape the markup: email clients strip `<style>`/`<head>`
 * and external CSS, so everything is inline `style=` on tables; a single
 * ~560px centred column keeps it readable on mobile without media queries.
 * Palette matches the storefront (rose `#a54659`, ink `#262220`, muted
 * `#786d68`) and the existing OTP email snippets.
 */

const BRAND = {
  name: "Woobe",
  rose: "#a54659",
  ink: "#262220",
  muted: "#786d68",
  hairline: "#ece7e3",
  canvas: "#faf7f5",
  card: "#ffffff",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

export interface LayoutInput {
  /** Large heading at the top of the body card. */
  heading: string;
  /** Pre-rendered HTML body fragment (already escaped by the caller). */
  bodyHtml: string;
  /** Optional single call-to-action button. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Hidden preheader text shown in the inbox preview line. */
  previewText?: string;
}

export interface TextLayoutInput {
  heading: string;
  bodyText: string;
  ctaLabel?: string;
  ctaHref?: string;
}

/** HTML-escape a string for safe interpolation into template markup. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function storefrontUrl(pathname = "/"): string {
  const base = env.WEB_ORIGIN.replace(/\/$/, "");
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function renderLayout(input: LayoutInput): string {
  const { heading, bodyHtml, ctaLabel, ctaHref, previewText } = input;
  const preheader = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(previewText)}</div>`
    : "";
  const cta =
    ctaLabel && ctaHref
      ? `<tr><td style="padding:8px 0 4px">
           <a href="${esc(ctaHref)}" style="display:inline-block;background:${BRAND.rose};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(ctaLabel)}</a>
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:${BRAND.font};color:${BRAND.ink}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.canvas};padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%">
      <tr><td style="padding:4px 6px 18px">
        <span style="font-size:22px;font-weight:700;letter-spacing:2px;color:${BRAND.rose}">${BRAND.name.toUpperCase()}</span>
      </td></tr>
      <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.hairline};border-radius:14px;padding:28px 26px">
        <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;color:${BRAND.ink}">${esc(heading)}</h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.6;color:${BRAND.ink}">
          <tr><td>${bodyHtml}</td></tr>
          ${cta}
        </table>
      </td></tr>
      <tr><td style="padding:18px 6px 4px;font-size:12px;line-height:1.6;color:${BRAND.muted}">
        Need help? Email <a href="mailto:${esc(env.SUPPORT_EMAIL)}" style="color:${BRAND.muted}">${esc(env.SUPPORT_EMAIL)}</a>.<br />
        <a href="${esc(storefrontUrl("/"))}" style="color:${BRAND.muted}">${esc(storefrontUrl("/").replace(/^https?:\/\//, ""))}</a>
        &nbsp;·&nbsp; &copy; ${new Date().getFullYear()} ${BRAND.name}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function renderTextLayout(input: TextLayoutInput): string {
  const { heading, bodyText, ctaLabel, ctaHref } = input;
  const lines = [heading.toUpperCase(), "", bodyText.trim()];
  if (ctaLabel && ctaHref) {
    lines.push("", `${ctaLabel}: ${ctaHref}`);
  }
  lines.push(
    "",
    "—",
    `Need help? Email ${env.SUPPORT_EMAIL}`,
    storefrontUrl("/"),
    `© ${new Date().getFullYear()} ${BRAND.name}`,
  );
  return lines.join("\n");
}

export const emailBrand = BRAND;
