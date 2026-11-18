/**
 * Business details the legal pages (privacy, terms, cookies) print.
 *
 * Values wrapped in [square brackets] are PLACEHOLDERS: they weren't found
 * anywhere in this repo and must be filled in by the business before these
 * pages are relied on. The Consumer Protection (E-Commerce) Rules 2020 and the
 * IT (Intermediary Guidelines) Rules 2021 require the legal name, address and
 * a named Grievance Officer to be published, so don't leave them as-is.
 * Changing a value here updates every legal page at once.
 */
export const LEGAL = {
  /** Registered legal entity that operates Woobe (company / LLP / proprietorship). */
  entityName: "[Legal entity name]",
  /** Registered office address, as on the GST / incorporation certificate. */
  registeredAddress: "[Registered office address, City, State, PIN]",
  /** City whose courts have jurisdiction over disputes. */
  jurisdictionCity: "[City]",
  /** Grievance Officer (IT Rules 2011 r.5(9), IT Rules 2021 r.3(2), E-Commerce Rules 2020 r.4(4)). */
  grievanceOfficerName: "[Grievance Officer name]",
  grievanceOfficerEmail: "[grievance@woobe.in]",
  /** Real: the support address already used across the storefront and by apps/api SUPPORT_EMAIL. */
  supportEmail: "hello@woobe.in",
  siteDomain: "www.woobe.in",
  /** Shown as "Last updated" on every legal page; bump it whenever the text changes. */
  lastUpdated: "14 November 2026",
} as const;
