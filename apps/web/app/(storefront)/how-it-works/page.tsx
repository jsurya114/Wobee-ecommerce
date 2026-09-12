import type { Metadata } from "next";
import { HowWoobeWorksPage } from "@/features/about/components/HowWoobeWorksPage";

export const metadata: Metadata = {
  title: "How Woobe Works",
  description: "How Woobe's surplus fashion, weight-based pricing, and fulfillment actually work.",
};

export default function HowItWorksPage() {
  return <HowWoobeWorksPage />;
}
