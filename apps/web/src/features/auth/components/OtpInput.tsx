"use client";

import { cn } from "@woobe/ui";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

export interface OtpInputHandle {
  focus: () => void;
}

interface OtpInputProps {
  /** Controlled — 0..length digit characters. */
  value: string;
  onChange: (next: string) => void;
  /** Fired once `value` reaches `length` digits (type or paste). */
  onComplete?: (code: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/**
 * Circular segmented code input. Fully controlled by the parent's `code`
 * string; typing auto-advances, backspace retreats and clears, arrows
 * navigate, non-digits are rejected, and pasting/autofilling a full code
 * fills every cell and fires `onComplete`. The parent owns any error text
 * (same split as `AuthField`); this only reflects `invalid` visually.
 */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(
  function OtpInput(
    {
      value,
      onChange,
      onComplete,
      length = 6,
      invalid = false,
      disabled = false,
      autoFocus = false,
      "aria-label": ariaLabel = "Verification code",
      "aria-describedby": ariaDescribedBy,
    },
    ref,
  ) {
    const cells = useRef<(HTMLInputElement | null)[]>([]);
    const firstEmpty = Math.min(value.length, length - 1);

    useImperativeHandle(
      ref,
      () => ({ focus: () => cells.current[firstEmpty]?.focus() }),
      [firstEmpty],
    );

    const commit = useCallback(
      (next: string, focusIndex: number) => {
        const trimmed = next.slice(0, length);
        onChange(trimmed);
        cells.current[Math.min(focusIndex, length - 1)]?.focus();
        if (trimmed.length === length) onComplete?.(trimmed);
      },
      [length, onChange, onComplete],
    );

    const handleInput = (index: number, raw: string) => {
      const digits = onlyDigits(raw);
      if (!digits) {
        // e.g. the char got rejected — keep the string as-is
        if (raw === "") commit(value.slice(0, index), index);
        return;
      }
      const next = (
        value.slice(0, index) +
        digits +
        value.slice(index + 1)
      ).slice(0, length);
      commit(next, index + digits.length);
    };

    const handleKeyDown = (
      index: number,
      e: KeyboardEvent<HTMLInputElement>,
    ) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        if (value[index]) {
          commit(value.slice(0, index) + value.slice(index + 1), index);
        } else if (index > 0) {
          commit(value.slice(0, index - 1) + value.slice(index), index - 1);
        }
        return;
      }
      if (e.key === "Delete") {
        e.preventDefault();
        commit(value.slice(0, index) + value.slice(index + 1), index);
        return;
      }
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        cells.current[index - 1]?.focus();
        return;
      }
      if (e.key === "ArrowRight" && index < length - 1) {
        e.preventDefault();
        cells.current[index + 1]?.focus();
      }
    };

    const handlePaste = (
      index: number,
      e: ClipboardEvent<HTMLInputElement>,
    ) => {
      e.preventDefault();
      const digits = onlyDigits(e.clipboardData.getData("text"));
      if (!digits) return;
      const next = (
        value.slice(0, index) +
        digits +
        value.slice(index + digits.length)
      ).slice(0, length);
      commit(next, index + digits.length);
    };

    return (
      <div
        role="group"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className="flex justify-between gap-2"
      >
        {Array.from({ length }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              cells.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={invalid || undefined}
            value={value[i] ?? ""}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              "h-12 w-12 rounded-full border bg-surface text-center font-body text-lg text-text-primary outline-none transition-colors",
              "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              invalid
                ? "border-error"
                : value[i]
                  ? "border-primary"
                  : "border-border",
            )}
          />
        ))}
      </div>
    );
  },
);
