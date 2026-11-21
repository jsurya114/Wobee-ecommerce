"use client";

import { Button, Input } from "@woobe/ui";
import { COURIER_CODES, COURIERS, type CourierCode } from "@woobe/validation";
import { useState } from "react";

export interface ShipmentValues {
  carrierCode: CourierCode;
  carrier?: string;
  trackingNumber: string;
  trackingUrl?: string;
}

interface Props {
  initial?: { carrierCode?: string | null; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null };
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: ShipmentValues) => void;
}

type InitialShipment = NonNullable<Props["initial"]>;

function initialCourierCode(initial?: InitialShipment): CourierCode {
  const code = initial?.carrierCode ?? "";
  return (COURIER_CODES as readonly string[]).includes(code) ? (code as CourierCode) : "OTHER";
}

/**
 * The stored link is only a per-shipment override when it differs from what the preset would
 * produce on its own; pre-fill just that, so re-saving keeps it and the preset default is not
 * frozen into the field.
 */
function initialOverrideUrl(initial?: InitialShipment): string {
  const stored = initial?.trackingUrl?.trim();
  if (!stored) return "";
  const code = initialCourierCode(initial);
  if (code === "OTHER") return stored;
  const preset = COURIERS[code];
  const deepLink = preset.deepLinkTemplate?.replace("{trackingNumber}", encodeURIComponent((initial?.trackingNumber ?? "").trim()));
  const presetDefault = deepLink ?? preset.trackingPageUrl;
  return stored === presetDefault ? "" : stored;
}

/** Courier dropdown + tracking number (+ name/link for "Other"), with a preview of the link the customer will get. */
export function ShipmentForm({ initial, submitLabel, busy, onSubmit }: Props) {
  const [carrierCode, setCarrierCode] = useState<CourierCode>(() => initialCourierCode(initial));
  const [carrier, setCarrier] = useState(() => (initialCourierCode(initial) === "OTHER" ? (initial?.carrier ?? "") : ""));
  const [trackingNumber, setTrackingNumber] = useState(initial?.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(() => initialOverrideUrl(initial));
  const preset = COURIERS[carrierCode];
  const isOther = carrierCode === "OTHER";
  const linkPreview = trackingUrl.trim() || preset.trackingPageUrl;
  const canSubmit = trackingNumber.trim().length > 0 && (!isOther || carrier.trim().length > 0);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <label className="font-body text-sm font-medium text-text-primary" htmlFor="ship-courier">
        Courier
      </label>
      <select
        id="ship-courier"
        value={carrierCode}
        onChange={(e) => setCarrierCode(e.target.value as CourierCode)}
        className="h-11 rounded-control border border-border bg-surface px-4 font-body text-base text-text-primary"
      >
        {COURIER_CODES.map((code) => (
          <option key={code} value={code}>
            {COURIERS[code].name}
          </option>
        ))}
      </select>
      {isOther ? <Input placeholder="Courier name" value={carrier} onChange={(e) => setCarrier(e.target.value)} /> : null}
      <Input placeholder="Tracking number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
      {preset.numberHint ? <p className="font-body text-xs text-text-secondary">Format: {preset.numberHint}</p> : null}
      <Input
        placeholder={isOther ? "Tracking link (optional)" : "Custom tracking link (optional, overrides the courier page)"}
        value={trackingUrl}
        onChange={(e) => setTrackingUrl(e.target.value)}
      />
      <p className="font-body text-xs text-text-secondary">
        {linkPreview
          ? `The email's tracking button opens: ${linkPreview}`
          : "No tracking page is set for this courier — the email shows the number and courier name only. Add a link above if you have one."}
      </p>
      <Button
        onClick={() =>
          onSubmit({
            carrierCode,
            carrier: isOther ? carrier.trim() : undefined,
            trackingNumber: trackingNumber.trim(),
            trackingUrl: trackingUrl.trim() || undefined,
          })
        }
        isLoading={busy}
        disabled={!canSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
