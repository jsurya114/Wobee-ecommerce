"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Search } from "lucide-react";
import type { ProductSuggestion } from "../api/products.client";

/**
 * The typeahead dropdown (redesign) — purely presentational. It renders an
 * ARIA `listbox` of product suggestions plus a "search everything" footer;
 * all state (which query, which row is active) and behaviour (navigate,
 * submit) are the caller's — see `SearchField`.
 */
export interface SearchSuggestionsProps {
  suggestions: ProductSuggestion[];
  isLoading: boolean;
  /** The current (raw) input text — drives the empty message and the footer. */
  query: string;
  /** Index of the keyboard-highlighted option, or -1. */
  activeIndex: number;
  listboxId: string;
  optionId: (index: number) => string;
  onSelect: (suggestion: ProductSuggestion) => void;
  onSeeAll: () => void;
  onHoverOption: (index: number) => void;
}

export function SearchSuggestions({
  suggestions,
  isLoading,
  query,
  activeIndex,
  listboxId,
  optionId,
  onSelect,
  onSeeAll,
  onHoverOption,
}: SearchSuggestionsProps) {
  const showEmpty = !isLoading && suggestions.length === 0;

  return (
    <div
      className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-card border border-border bg-surface shadow-modal"
      // Pointer-down (not click) so selecting a row wins the race against the
      // input's blur/close handler.
      onMouseDown={(event) => event.preventDefault()}
    >
      <ul id={listboxId} role="listbox" aria-label="Search suggestions" className="max-h-[min(60vh,22rem)] overflow-y-auto py-1">
        {isLoading && suggestions.length === 0
          ? [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="h-12 w-9 shrink-0 animate-pulse rounded-control bg-surface-2 motion-reduce:animate-none" />
                <span className="h-3 w-1/2 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
              </li>
            ))
          : suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex;
              return (
                <li key={suggestion.id} role="option" id={optionId(index)} aria-selected={isActive}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => onHoverOption(index)}
                    onClick={() => onSelect(suggestion)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-primary-tint" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="h-12 w-9 shrink-0 overflow-hidden rounded-control bg-surface-2">
                      {suggestion.primaryImage ? (
                        <img
                          src={suggestion.primaryImage.url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-body text-sm text-text-primary">{suggestion.name}</span>
                    <span className="shrink-0 font-body text-xs font-medium text-text-secondary">
                      {formatPaiseAsInr(suggestion.minPricePaiseCache)}
                    </span>
                  </button>
                </li>
              );
            })}

        {showEmpty ? (
          <li className="px-3 py-3 font-body text-xs text-text-secondary">
            No product matches “{query.trim()}”. Press Enter to search everything.
          </li>
        ) : null}
      </ul>

      <button
        type="button"
        tabIndex={-1}
        onClick={onSeeAll}
        className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 font-body text-xs font-medium text-primary transition-colors hover:bg-surface-2"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Search for “{query.trim()}”
      </button>
    </div>
  );
}
