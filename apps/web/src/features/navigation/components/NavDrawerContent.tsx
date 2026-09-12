import { ABOUT_LINKS, HELP_LINKS, SHOP_ALL_LINK, SHOP_LINKS } from "../lib/nav-links";
import { CategorySection } from "./CategorySection";
import { NavLinkItem } from "./NavLinkItem";
import { NavSection } from "./NavSection";

/**
 * The hamburger's full information architecture: discovery (Shop), Help &
 * Support, and About Woobe — deliberately not a fourth Policies group (no
 * privacy/terms/shipping/return policy pages exist yet) and deliberately
 * not Account/Shop/Wishlist/Bag/Search, which already have dedicated
 * locations (BottomNav / SiteHeader's own nav / HeaderSearch).
 */
export function NavDrawerContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col divide-y divide-border">
      <NavSection heading="Shop">
        <NavLinkItem href={SHOP_ALL_LINK.href} onNavigate={onNavigate}>
          {SHOP_ALL_LINK.label}
        </NavLinkItem>
        <CategorySection onNavigate={onNavigate} />
        {SHOP_LINKS.map((link) => (
          <NavLinkItem key={link.label} href={link.href} onNavigate={onNavigate}>
            {link.label}
          </NavLinkItem>
        ))}
      </NavSection>

      <NavSection heading="Help & Support">
        {HELP_LINKS.map((link) => (
          <NavLinkItem key={link.label} href={link.href} onNavigate={onNavigate}>
            {link.label}
          </NavLinkItem>
        ))}
      </NavSection>

      <NavSection heading="About Woobe">
        {ABOUT_LINKS.map((link) => (
          <NavLinkItem key={link.label} href={link.href} onNavigate={onNavigate}>
            {link.label}
          </NavLinkItem>
        ))}
      </NavSection>
    </nav>
  );
}
