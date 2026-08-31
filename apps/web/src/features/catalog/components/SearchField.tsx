"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { MIN_SUGGESTION_QUERY_LENGTH, useSearchSuggestions } from "../hooks/useSearchSuggestions";
import { ProductSearchForm } from "./ProductSearchForm";
import { SearchSuggestions } from "./SearchSuggestions";

/**
 * `ProductSearchForm` + a debounced typeahead dropdown (redesign). The one
 * place the two are wired together — used by `HeaderSearch` (the header
 * search); any future search entry point reuses it for identical behaviour:
 *
 *  - typing → debounced `GET /api/v1/products/suggestions` (previous request
 *    aborted), results shown in an ARIA listbox;
 *  - ↑/↓ move a highlight, Enter on a highlight jumps to that product
 *    (`onSelectSuggestion`), Enter with nothing highlighted runs the normal
 *    full search (`onSubmit`), Escape closes the dropdown;
 *  - clicking a row jumps to that product; the footer runs the full search.
 *
 * `onSubmit` is passed straight through — the existing submit-to-`/products`
 * behaviour of every caller is unchanged.
 */
export interface SearchFieldProps {
  initialQuery?: string;
  onSubmit: (query: string) => void;
  onSelectSuggestion: (slug: string) => void;
  /** Pause the typeahead without unmounting (e.g. the header search while collapsed). Default true. */
  suggestionsEnabled?: boolean;
  hideIcon?: boolean;
  className?: string;
  inputClassName?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { initialQuery = "", onSubmit, onSelectSuggestion, suggestionsEnabled = true, hideIcon, className, inputClassName },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Mirror ProductSearchForm's own re-sync: when the committed query changes
  // for a reason other than a keystroke here (e.g. PLP "Clear filters"),
  // follow it and drop any open dropdown.
  useEffect(() => {
    setQuery(initialQuery);
    setOpen(false);
    setActiveIndex(-1);
  }, [initialQuery]);

  const { suggestions, isLoading } = useSearchSuggestions(query, { enabled: suggestionsEnabled && open });

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const trimmed = query.trim();
  const showDropdown = open && suggestionsEnabled && trimmed.length >= MIN_SUGGESTION_QUERY_LENGTH;

  // Keep the highlight in range as the list changes.
  useEffect(() => {
    setActiveIndex((current) => (current >= suggestions.length ? -1 : current));
  }, [suggestions.length]);

  // Close on outside pointer-down.
  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDropdown]);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleSubmit(value: string) {
    close();
    onSubmit(value);
  }

  function selectAt(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    close();
    onSelectSuggestion(suggestion.slug);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (!showDropdown || suggestions.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      if (!showDropdown || suggestions.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      if (showDropdown && activeIndex >= 0) {
        event.preventDefault(); // don't let the form submit — jump to the product instead
        selectAt(activeIndex);
      }
    } else if (event.key === "Escape") {
      if (showDropdown) {
        event.stopPropagation(); // first Escape just closes the dropdown
        close();
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <ProductSearchForm
        ref={inputRef}
        initialQuery={initialQuery}
        onSubmit={handleSubmit}
        onQueryChange={(value) => {
          setQuery(value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        hideIcon={hideIcon}
        className={className}
        inputClassName={inputClassName}
        inputProps={{
          role: "combobox",
          "aria-expanded": showDropdown,
          "aria-controls": showDropdown ? listboxId : undefined,
          "aria-activedescendant": showDropdown && activeIndex >= 0 ? optionId(activeIndex) : undefined,
          "aria-autocomplete": "list",
          autoComplete: "off",
          onKeyDown: handleKeyDown,
          onFocus: () => {
            if (trimmed.length >= MIN_SUGGESTION_QUERY_LENGTH) setOpen(true);
          },
        }}
      />

      {showDropdown ? (
        <SearchSuggestions
          suggestions={suggestions}
          isLoading={isLoading}
          query={query}
          activeIndex={activeIndex}
          listboxId={listboxId}
          optionId={optionId}
          onSelect={(suggestion) => {
            close();
            onSelectSuggestion(suggestion.slug);
          }}
          onSeeAll={() => handleSubmit(trimmed)}
          onHoverOption={setActiveIndex}
        />
      ) : null}
    </div>
  );
});
