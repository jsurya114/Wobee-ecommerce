import type { EmailMessage } from "../email-message";
import { emailBrand, esc, renderLayout, renderTextLayout, storefrontUrl } from "./layout";
import { bool, greeting, money, num, str } from "./render-helpers";

type Rendered = Pick<EmailMessage, "subject" | "html" | "text">;

interface InvoiceLine {
  name: string;
  variant?: string;
  quantity: number;
  unitPricePaise?: number;
  lineTotalPaise?: number;
}

function readLines(raw: unknown): InvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const parts = [str(item.color), str(item.size)].filter(Boolean);
    return {
      name: str(item.name) ?? str(item.productNameSnapshot) ?? "Item",
      variant: parts.length > 0 ? parts.join(" · ") : str(item.variant),
      quantity: num(item.quantity) ?? 1,
      unitPricePaise: num(item.unitPricePaise),
      lineTotalPaise: num(item.lineTotalPaise),
    };
  });
}

function paymentLabel(payload: Record<string, unknown>): string {
  const status = str(payload.paymentStatus);
  const method = str(payload.paymentMethod);
  if (status === "PAID") return method === "RAZORPAY" ? "Paid (Razorpay)" : "Paid";
  if (status === "PAY_ON_DELIVERY" || method === "COD") return "Pay on delivery (Cash)";
  return status ? status.replace(/_/g, " ").toLowerCase() : "—";
}

function addressRows(payload: Record<string, unknown>): string[] {
  const a = (payload.shippingAddress ?? {}) as Record<string, unknown>;
  return [
    str(a.fullName),
    str(a.line1),
    str(a.line2),
    [str(a.city), str(a.state), str(a.pincode)].filter(Boolean).join(", ") || undefined,
    str(a.phone),
  ].filter((r): r is string => Boolean(r));
}

function addressBlockHtml(payload: Record<string, unknown>): string {
  const rows = addressRows(payload);
  if (rows.length === 0) return "";
  return `<p style="margin:16px 0 4px;font-weight:600">Ship to</p>
    <p style="margin:0;color:#786d68;font-size:14px;line-height:1.6">${rows.map((r) => esc(r)).join("<br />")}</p>`;
}

function totalsRow(label: string, value: string, opts: { bold?: boolean } = {}): string {
  const weight = opts.bold ? "700" : "400";
  const color = opts.bold ? emailBrand.ink : "#786d68";
  return `<tr>
    <td style="padding:4px 0;font-size:14px;color:${color};font-weight:${weight}">${esc(label)}</td>
    <td style="padding:4px 0;font-size:14px;color:${color};font-weight:${weight};text-align:right">${esc(value)}</td>
  </tr>`;
}

/**
 * Order confirmed — THE invoice / receipt email (payment-success and
 * order-confirmed are one instant in this system, so this one message
 * covers "order confirmed" + "payment received" + "invoice"). Every paise
 * figure is passed in already-authoritative from the order snapshot; this
 * template only formats and lays out — no calculation.
 */
export function renderOrderConfirmedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const name = str(payload.contactName);
  const lines = readLines(payload.items);
  const discount = num(payload.discountPaise) ?? 0;
  const shippingFee = num(payload.shippingFeePaise) ?? 0;
  const orderHref = storefrontUrl("/account/orders");

  const itemRowsHtml = lines
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #ece7e3;font-size:14px">
          ${esc(l.name)}${l.variant ? `<br /><span style="color:#786d68;font-size:12px">${esc(l.variant)}</span>` : ""}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #ece7e3;font-size:14px;text-align:center">${esc(l.quantity)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #ece7e3;font-size:14px;text-align:right">${esc(money(l.unitPricePaise))}</td>
        <td style="padding:8px 0;border-bottom:1px solid #ece7e3;font-size:14px;text-align:right">${esc(money(l.lineTotalPaise))}</td>
      </tr>`,
    )
    .join("");

  const totalsHtml = [
    totalsRow("Subtotal", money(payload.subtotalPaise)),
    discount > 0 ? totalsRow("Discount", `- ${money(discount)}`) : "",
    totalsRow("Shipping", shippingFee > 0 ? money(shippingFee) : "Free"),
    totalsRow("GST / Tax", money(payload.taxPaise)),
    totalsRow("Total", money(payload.totalPaise), { bold: true }),
  ].join("");

  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 16px">Thanks for your order. Here's your confirmation and invoice for <strong>order #${esc(orderNumber)}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
      <tr>
        <td style="padding:0 0 6px;font-size:12px;color:#786d68;text-transform:uppercase;letter-spacing:1px">Item</td>
        <td style="padding:0 0 6px;font-size:12px;color:#786d68;text-align:center">Qty</td>
        <td style="padding:0 0 6px;font-size:12px;color:#786d68;text-align:right">Unit</td>
        <td style="padding:0 0 6px;font-size:12px;color:#786d68;text-align:right">Total</td>
      </tr>
      ${itemRowsHtml}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0">${totalsHtml}</table>
    ${addressBlockHtml(payload)}
    <p style="margin:16px 0 0;font-size:14px"><strong>Payment:</strong> ${esc(paymentLabel(payload))}</p>`;

  const textLines = lines
    .map((l) => `- ${l.name}${l.variant ? ` (${l.variant})` : ""} ×${l.quantity}  ${money(l.lineTotalPaise)}`)
    .join("\n");
  const shipTo = addressRows(payload);
  const bodyText = [
    greeting(name),
    "",
    `Thanks for your order. Confirmation & invoice for order #${orderNumber}.`,
    "",
    textLines,
    "",
    `Subtotal: ${money(payload.subtotalPaise)}`,
    discount > 0 ? `Discount: -${money(discount)}` : "",
    `Shipping: ${shippingFee > 0 ? money(shippingFee) : "Free"}`,
    `GST / Tax: ${money(payload.taxPaise)}`,
    `Total: ${money(payload.totalPaise)}`,
    "",
    ...(shipTo.length > 0 ? ["Ship to:", ...shipTo.map((r) => `  ${r}`), ""] : []),
    `Payment: ${paymentLabel(payload)}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return {
    subject: `Order #${orderNumber} confirmed`,
    html: renderLayout({
      heading: `Order #${orderNumber} confirmed`,
      bodyHtml,
      previewText: `We've got your order. Total ${money(payload.totalPaise)}.`,
      ctaLabel: "View your orders",
      ctaHref: orderHref,
    }),
    text: renderTextLayout({ heading: `Order #${orderNumber} confirmed`, bodyText, ctaLabel: "View your orders", ctaHref: orderHref }),
  };
}

export function renderPaymentFailedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const name = str(payload.contactName);
  const total = num(payload.totalPaise);
  const href = storefrontUrl("/account/orders");
  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 12px">We couldn't confirm payment for <strong>order #${esc(orderNumber)}</strong>${
      total !== undefined ? ` (${esc(money(total))})` : ""
    }, so it hasn't been placed.</p>
    <p style="margin:0">No money has been taken. You can try again from your orders page.</p>`;
  return {
    subject: `Payment failed for order #${orderNumber}`,
    html: renderLayout({ heading: "Payment didn't go through", bodyHtml, previewText: "Your payment couldn't be confirmed.", ctaLabel: "Try again", ctaHref: href }),
    text: renderTextLayout({
      heading: "Payment didn't go through",
      bodyText: `${greeting(name)}\n\nWe couldn't confirm payment for order #${orderNumber}${
        total !== undefined ? ` (${money(total)})` : ""
      }, so it hasn't been placed. No money has been taken — you can try again from your orders page.`,
      ctaLabel: "Try again",
      ctaHref: href,
    }),
  };
}

export function renderOrderShippedEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const name = str(payload.contactName);
  const carrier = str(payload.carrier);
  const tracking = str(payload.trackingNumber);
  const trackingUrl = str(payload.trackingUrl);
  const href = storefrontUrl("/account/orders");

  const trackingBits: string[] = [];
  if (carrier) trackingBits.push(`Carrier: <strong>${esc(carrier)}</strong>`);
  if (tracking) trackingBits.push(`Tracking number: <strong>${esc(tracking)}</strong>`);
  const trackingHtml = trackingBits.length > 0 ? `<p style="margin:0 0 12px">${trackingBits.join("<br />")}</p>` : "";

  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 12px">Good news — <strong>order #${esc(orderNumber)}</strong> is on its way.</p>
    ${trackingHtml}
    ${trackingUrl ? `<p style="margin:0"><a href="${esc(trackingUrl)}" style="color:${emailBrand.rose}">Track your parcel</a></p>` : ""}`;

  const textBits = [
    greeting(name),
    "",
    `Good news — order #${orderNumber} is on its way.`,
    carrier ? `Carrier: ${carrier}` : "",
    tracking ? `Tracking number: ${tracking}` : "",
    trackingUrl ? `Track: ${trackingUrl}` : "",
  ].filter((l) => l !== "");

  return {
    subject: `Your order #${orderNumber} has shipped`,
    html: renderLayout({ heading: `Order #${orderNumber} has shipped`, bodyHtml, previewText: "Your order is on its way.", ctaLabel: "View your orders", ctaHref: href }),
    text: renderTextLayout({ heading: `Order #${orderNumber} has shipped`, bodyText: textBits.join("\n"), ctaLabel: "View your orders", ctaHref: href }),
  };
}

export function renderOrderDeliveredEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const name = str(payload.contactName);
  const href = storefrontUrl("/account/orders");
  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 12px"><strong>Order #${esc(orderNumber)}</strong> has been delivered. We hope you love it.</p>
    <p style="margin:0">If something isn't right, you can start a return from your orders page while it's still within the return window.</p>`;
  return {
    subject: `Your order #${orderNumber} has been delivered`,
    html: renderLayout({ heading: `Order #${orderNumber} delivered`, bodyHtml, previewText: "Your order has been delivered.", ctaLabel: "View your orders", ctaHref: href }),
    text: renderTextLayout({
      heading: `Order #${orderNumber} delivered`,
      bodyText: `${greeting(name)}\n\nOrder #${orderNumber} has been delivered. If something isn't right, you can start a return from your orders page while it's still within the return window.`,
      ctaLabel: "View your orders",
      ctaHref: href,
    }),
  };
}

export function renderOrderCancelledEmail(payload: Record<string, unknown>): Rendered {
  const orderNumber = str(payload.orderNumber) ?? "";
  const name = str(payload.contactName);
  const reason = str(payload.cancellationReason);
  const refundIssued = bool(payload.refundIssued);
  const href = storefrontUrl("/account/orders");
  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 12px"><strong>Order #${esc(orderNumber)}</strong> has been cancelled${reason ? `: ${esc(reason)}` : "."}</p>
    ${
      refundIssued
        ? `<p style="margin:0">A refund has been initiated to your original payment method and may take a few business days to appear.</p>`
        : `<p style="margin:0">If you were charged for this order, a refund will follow separately.</p>`
    }`;
  return {
    subject: `Order #${orderNumber} cancelled`,
    html: renderLayout({ heading: `Order #${orderNumber} cancelled`, bodyHtml, previewText: "Your order has been cancelled.", ctaLabel: "View your orders", ctaHref: href }),
    text: renderTextLayout({
      heading: `Order #${orderNumber} cancelled`,
      bodyText: `${greeting(name)}\n\nOrder #${orderNumber} has been cancelled${reason ? `: ${reason}` : "."}\n\n${
        refundIssued
          ? "A refund has been initiated to your original payment method and may take a few business days to appear."
          : "If you were charged for this order, a refund will follow separately."
      }`,
      ctaLabel: "View your orders",
      ctaHref: href,
    }),
  };
}
