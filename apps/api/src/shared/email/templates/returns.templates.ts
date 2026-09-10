import type { EmailMessage } from "../email-message";
import { esc, renderLayout, renderTextLayout, storefrontUrl } from "./layout";
import { money, num, str } from "./render-helpers";

type Rendered = Pick<EmailMessage, "subject" | "html" | "text">;

const ordersHref = () => storefrontUrl("/account/orders");

function simple(opts: {
  subject: string;
  heading: string;
  intro: string;
  extra?: string;
  preview: string;
}): Rendered {
  const { subject, heading, intro, extra, preview } = opts;
  const bodyHtml = `<p style="margin:0 0 12px">${esc(intro)}</p>${extra ? `<p style="margin:0">${esc(extra)}</p>` : ""}`;
  return {
    subject,
    html: renderLayout({ heading, bodyHtml, previewText: preview, ctaLabel: "View your orders", ctaHref: ordersHref() }),
    text: renderTextLayout({ heading, bodyText: `${intro}${extra ? `\n\n${extra}` : ""}`, ctaLabel: "View your orders", ctaHref: ordersHref() }),
  };
}

export function renderReturnRequestedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const count = num(payload.itemCount);
  return simple({
    subject: `We've received your return request for order #${orderNumber}`,
    heading: "Return request received",
    intro: `We've received your return request for order #${orderNumber}${count ? ` (${count} item${count === 1 ? "" : "s"})` : ""}. Our team will review it and get back to you.`,
    extra: "You'll get another email once it's been reviewed.",
    preview: "We've received your return request.",
  });
}

export function renderReturnApprovedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  return simple({
    subject: `Your return for order #${orderNumber} is approved`,
    heading: "Return approved",
    intro: `Your return request for order #${orderNumber} has been approved.`,
    extra: "We'll process your refund once the item is on its way back to us. You'll be notified at each step.",
    preview: "Your return has been approved.",
  });
}

export function renderReturnRejectedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const reason = str(payload.reason);
  return simple({
    subject: `Update on your return for order #${orderNumber}`,
    heading: "Return request update",
    intro: `We've reviewed your return request for order #${orderNumber} and we're unable to approve it at this time${reason ? `: ${reason}` : "."}`,
    extra: "If you think this is a mistake or you'd like more detail, just reply to this email or contact support.",
    preview: "An update on your return request.",
  });
}

export function renderRefundInitiatedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const amount = num(payload.amountPaise);
  return simple({
    subject: `Refund initiated for order #${orderNumber}`,
    heading: "Refund initiated",
    intro: `We've initiated a refund${amount !== undefined ? ` of ${money(amount)}` : ""} for order #${orderNumber}.`,
    extra: "It may take a few business days to reach your original payment method. We'll email you again once it's completed.",
    preview: "Your refund is on its way.",
  });
}

export function renderRefundCompletedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const amount = num(payload.amountPaise);
  return simple({
    subject: `Refund completed for order #${orderNumber}`,
    heading: "Refund completed",
    intro: `Your refund${amount !== undefined ? ` of ${money(amount)}` : ""} for order #${orderNumber} has been completed.`,
    extra: "Depending on your bank, it may take a little longer to show up on your statement.",
    preview: "Your refund has been completed.",
  });
}
