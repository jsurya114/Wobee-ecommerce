"use client";

import { Input, cn } from "@woobe/ui";
import { Search } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
} from "react";

/**
 * The one search input, used by the header `HeaderSearch` (via
 * `SearchField`). It owns nothing about *where* a search goes — the
 * caller's `onSubmit(query)` decides that (the header routes to
 * /products?q=). Backend search is the existing `?q=` param → GET
 * /api/v1/products (full results) and GET /api/v1/products/suggestions
 * (typeahead).
 *
 * `ref` forwards to the `<input>` so a caller (the header's expand/collapse,
 * or `SearchField`'s keyboard handling) can focus it. `hideIcon` drops the
 * built-in prefix magnifier. `onQueryChange` and `inputProps` are additive
 * extension points (OCP) used by `SearchField` to layer a suggestions
 * dropdown on top without touching the submit path.
 */
export const ProductSearchForm = forwardRef<
  HTMLInputElement,
  {
    initialQuery?: string;
    onSubmit: (query: string) => void;
    hideIcon?: boolean;
    className?: string;
    inputClassName?: string;
    /** Fires on every keystroke with the live (untrimmed) value. */
    onQueryChange?: (query: string) => void;
    /** Extra props merged onto the `<input>` (keydown, combobox ARIA, …). Explicit props still win. */
    inputProps?: Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "ref">;
  }
>(function ProductSearchForm(
  { initialQuery = "", onSubmit, hideIcon = false, className, inputClassName, onQueryChange, inputProps },
  ref,
) {
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const [value, setValue] = useState(initialQuery);

  // Re-sync when the committed query changes for a reason other than this
  // form's own submit (e.g. the PLP's "Clear filters"). Only fires on a real
  // change to `initialQuery`, so it never clobbers in-progress typing.
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value.trim());
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={className}>
      <label htmlFor={fieldId} className="sr-only">
        Search products
      </label>
      <div className="relative">
        {hideIcon ? null : (
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        <Input
          {...inputProps}
          ref={inputRef}
          id={fieldId}
          type="search"
          name="q"
          placeholder="Search tops, dresses, accessories…"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onQueryChange?.(event.target.value);
          }}
          className={cn(hideIcon ? undefined : "pl-10", inputClassName)}
        />
      </div>
    </form>
  );
});
