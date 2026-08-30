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
  type FormEvent,
} from "react";

/**
 * The one search input, shared by the PLP `SearchBar` and the header
 * `HeaderSearch`. It owns nothing about *where* a search goes — the caller's
 * `onSubmit(query)` decides that (PLP preserves its other filters via
 * buildProductsHref; the header just routes to /products?q=). Backend search
 * is the existing `?q=` param → GET /api/v1/products (name contains,
 * case-insensitive) — this component doesn't change that.
 *
 * `ref` forwards to the `<input>` so a caller (the header's expand/collapse)
 * can focus it. `hideIcon` drops the built-in prefix magnifier for callers
 * that supply their own toggle icon.
 */
export const ProductSearchForm = forwardRef<
  HTMLInputElement,
  {
    initialQuery?: string;
    onSubmit: (query: string) => void;
    hideIcon?: boolean;
    className?: string;
    inputClassName?: string;
  }
>(function ProductSearchForm(
  { initialQuery = "", onSubmit, hideIcon = false, className, inputClassName },
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
          ref={inputRef}
          id={fieldId}
          type="search"
          name="q"
          placeholder="Search products…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={cn(hideIcon ? undefined : "pl-10", inputClassName)}
        />
      </div>
    </form>
  );
});
