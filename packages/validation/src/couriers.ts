/**
 * Courier presets for the shipped-order email and the admin "mark as shipped" form.
 *
 * `trackingPageUrl` is each courier's own tracking page (checked 2026-10-22). No courier here
 * publishes a query-string deep link we could confirm, so the email shows the tracking number
 * prominently next to a button to the courier's page; the number is NOT pre-filled. If staff find a
 * working deep link they can paste it per shipment (the ship form's "tracking link" field), or set
 * `deepLinkTemplate` below once it has been tested with a real consignment number.
 * Anjani and Sri Maruti have no confirmed official page, so they carry none.
 */
export const COURIER_CODES = [
  "EKART",
  "DTDC",
  "INDIA_POST",
  "DELHIVERY",
  "BLUE_DART",
  "XPRESSBEES",
  "PROFESSIONAL_COURIERS",
  "ST_COURIER",
  "ANJANI",
  "SRI_MARUTI",
  "VRL",
  "OTHER",
] as const;
export type CourierCode = (typeof COURIER_CODES)[number];

export interface CourierPreset {
  code: CourierCode;
  name: string;
  /** Official tracking page; null when none is confirmed. */
  trackingPageUrl: string | null;
  /** Tested link with `{trackingNumber}` pre-filled; leave undefined until verified with a real number. */
  deepLinkTemplate?: string;
  /** Shown under the tracking-number field in admin. Soft hint only, never validated. */
  numberHint?: string;
  /** Courier-specific lines for the customer email. */
  tips: string[];
  supportPhone?: string;
  supportEmail?: string;
}

export const COURIERS: Record<CourierCode, CourierPreset> = {
  EKART: {
    code: "EKART",
    name: "Ekart Logistics",
    trackingPageUrl: "https://ekartlogistics.com/shipmenttrack",
    tips: ["A new tracking number can take a little while to show updates after dispatch."],
  },
  DTDC: {
    code: "DTDC",
    name: "DTDC",
    trackingPageUrl: "https://www.dtdc.com/",
    tips: ["Open DTDC's site and use the tracking box with your consignment number."],
  },
  INDIA_POST: {
    code: "INDIA_POST",
    name: "India Post (Speed Post)",
    trackingPageUrl: "https://www.indiapost.gov.in/",
    numberHint: "13 characters, e.g. EE123456789IN",
    tips: [
      "Use Track & Trace on the India Post site with your article number.",
      "A new article number can take a day or two to show updates after dispatch.",
    ],
  },
  DELHIVERY: {
    code: "DELHIVERY",
    name: "Delhivery",
    trackingPageUrl: "https://www.delhivery.com/tracking",
    supportEmail: "clientservice@delhivery.com",
    tips: ["Choose \"AWB\" on Delhivery's tracking page and enter the number below."],
  },
  BLUE_DART: {
    code: "BLUE_DART",
    name: "Blue Dart",
    trackingPageUrl: "https://www.bluedart.com/tracking",
    numberHint: "11-digit waybill number",
    tips: ["Enter the waybill number on Blue Dart's tracking page."],
  },
  XPRESSBEES: {
    code: "XPRESSBEES",
    name: "Xpressbees",
    trackingPageUrl: "https://www.xpressbees.com/",
    tips: ["Use the tracking box on Xpressbees' home page and choose AWB."],
  },
  PROFESSIONAL_COURIERS: {
    code: "PROFESSIONAL_COURIERS",
    name: "Professional Couriers (TPC)",
    trackingPageUrl: "https://www.tpcindia.com/",
    tips: ["Enter the consignment number in the tracking box on the TPC site."],
  },
  ST_COURIER: {
    code: "ST_COURIER",
    name: "ST Courier",
    trackingPageUrl: "https://www.stcourier.com/",
    supportPhone: "044 612 66 666",
    supportEmail: "helpdesk@stcourier.com",
    tips: ["Use \"Track Shipment\" on the ST Courier site with your consignment number."],
  },
  ANJANI: {
    code: "ANJANI",
    name: "Anjani Courier",
    trackingPageUrl: null,
    tips: ["Quote this consignment number to the Anjani Courier branch for the latest status."],
  },
  SRI_MARUTI: {
    code: "SRI_MARUTI",
    name: "Sri Maruti Courier",
    trackingPageUrl: null,
    tips: ["Quote this consignment number to the Sri Maruti Courier branch for the latest status."],
  },
  VRL: {
    code: "VRL",
    name: "VRL Logistics",
    trackingPageUrl: "https://www.vrlgroup.in/",
    supportPhone: "1800 599 7800",
    supportEmail: "customercare@vrllogistics.com",
    tips: ["Track with your LR / consignment number on the VRL site."],
  },
  OTHER: {
    code: "OTHER",
    name: "Other courier",
    trackingPageUrl: null,
    tips: [],
  },
};

export interface ResolvedCourier {
  code: CourierCode | null;
  /** Name shown to the customer. */
  name: string;
  trackingUrl: string | null;
}

/**
 * Turns the admin's courier choice into the stored carrier name and tracking link.
 * Precedence for the link: explicit per-shipment link > tested deep link > the courier's page.
 * `code` is null for legacy callers that only supplied a free-text carrier.
 */
export function resolveCourier(input: {
  carrierCode?: CourierCode | null;
  carrier?: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
}): ResolvedCourier {
  const explicit = input.trackingUrl?.trim() || null;
  const code = input.carrierCode ?? null;
  if (!code || code === "OTHER") {
    return { code, name: input.carrier?.trim() || COURIERS.OTHER.name, trackingUrl: explicit };
  }
  const preset = COURIERS[code];
  const deepLink = preset.deepLinkTemplate?.replace("{trackingNumber}", encodeURIComponent(input.trackingNumber.trim()));
  return { code, name: preset.name, trackingUrl: explicit ?? deepLink ?? preset.trackingPageUrl };
}

export function isCourierCode(value: unknown): value is CourierCode {
  return typeof value === "string" && (COURIER_CODES as readonly string[]).includes(value);
}
