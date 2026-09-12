"use client";

import { NavDrawer } from "@woobe/ui";
import { NAV_DRAWER_ID } from "../lib/constants";
import { NavDrawerContent } from "./NavDrawerContent";

export function SiteNavDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <NavDrawer open={open} onOpenChange={onOpenChange} title="Menu" id={NAV_DRAWER_ID}>
      <NavDrawerContent onNavigate={() => onOpenChange(false)} />
    </NavDrawer>
  );
}
