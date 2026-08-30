import { BrandMark } from "./BrandMark";

export function TopBar() {
  return (
    // Desktop only — on mobile the sidebar's own hamburger bar is the top bar.
    // Just the wordmark + super-admin star, right-aligned.
    <header className="hidden items-center justify-end border-b border-border px-4 py-3 md:flex md:px-6">
      <BrandMark />
    </header>
  );
}
