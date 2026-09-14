import type { UpdateProductInput as UpdateProductRequest } from "@woobe/validation";
import { ValidationError } from "../../../../../shared/errors";
import { resolveUniqueSlug } from "../../../domain/resolve-unique-slug";
import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { PricingReaderPort } from "../../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Metadata edit (name/slug/description/brand/category/SEO/pricingMode) —
 * activation/deactivation is its own use-case (SetProductActiveUseCase), a
 * distinct admin action per week2 (1).md §16's own operations list.
 *
 * Slug is left untouched unless the admin explicitly supplies one — editing
 * the product NAME must never silently change its slug (would break any
 * existing external link/bookmark to the product). When a slug IS supplied,
 * it's still canonicalized + de-duplicated the same way create does,
 * excluding this product's own current row from the uniqueness check (so
 * re-saving the form with its own unchanged slug never false-positives as
 * "taken").
 *
 * pricingMode (2026-09-14) is the one field here that isn't a plain
 * metadata write — switching it changes which of a variant's own fields is
 * authoritative for price, so every existing variant has to be brought
 * consistent with the NEW mode in the same operation (see
 * `applyPricingModeSwitch`'s own doc comment). This never touches any
 * OrderItem — historical orders keep the pricingMode/unitPricePaise they
 * snapshotted at checkout regardless of what a product is edited to later.
 */
export class UpdateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  async execute(productId: string, input: UpdateProductRequest): Promise<AdminProductDetailEntity> {
    let finalInput = input;

    if (input.pricingMode !== undefined) {
      await this.applyPricingModeSwitch(productId, input.pricingMode);
    }

    if (input.slug !== undefined) {
      const slug = await resolveUniqueSlug(input.slug, (candidate) => this.productRepository.slugExists(candidate, productId));
      finalInput = { ...finalInput, slug };
    }

    return this.productRepository.updateProduct(productId, finalInput);
  }

  /**
   * Brings every one of this product's variants consistent with a NEW
   * pricingMode before the Product row itself is switched — so there is
   * never a moment where Product.pricingMode says one thing and a variant's
   * own fields still reflect the old mode (which is exactly the "duplicate
   * source of truth" this whole feature exists to avoid — see
   * resolveEffectivePrice, which would otherwise throw for a FIXED variant
   * with no fixedPricePaise, or silently ignore a stale fixedPricePaise
   * left over on a variant switched back to WEIGHT_BASED).
   *
   * WEIGHT_BASED -> FIXED: every ACTIVE variant must already carry a
   * fixedPricePaise (the admin sets these via the ordinary variant edit
   * form first — see VariantForm — while the product is still WEIGHT_BASED,
   * where that field is stored but ignored for pricing). Rejected with a
   * clear 400 otherwise, rather than silently leaving a variant unpriceable.
   * effectivePricePaiseCache is then recomputed from that fixedPricePaise
   * for every variant (active or not) so the listing/sort cache never lags.
   *
   * FIXED -> WEIGHT_BASED: fixedPricePaise is cleared (set null) on every
   * variant — it stops being authoritative, and leaving stale values around
   * risks exactly this same "which field actually priced this" confusion if
   * the product is ever switched back later. effectivePricePaiseCache is
   * recomputed from weightGrams x the current global rate for every variant.
   */
  private async applyPricingModeSwitch(productId: string, newMode: "WEIGHT_BASED" | "FIXED"): Promise<void> {
    const currentMode = await this.productRepository.findProductPricingMode(productId);
    if (!currentMode) {
      throw new ValidationError("Product not found");
    }
    if (currentMode === newMode) {
      return; // No-op switch — nothing to reconcile.
    }

    const variants = await this.productRepository.findVariantsForPricingModeSwitch(productId);

    if (newMode === "FIXED") {
      const missing = variants.filter((v) => v.isActive && v.fixedPricePaise == null);
      if (missing.length > 0) {
        throw new ValidationError(
          "Every active variant needs a fixed price before switching this product to fixed pricing — set it on each variant first, then switch the mode.",
          { pricingMode: ["One or more active variants have no fixed price set"] },
        );
      }
    }

    // Only variants whose new-mode price is actually computable — an
    // INACTIVE variant switching to FIXED with no fixedPricePaise (the
    // active-only check above lets that through) is left completely alone
    // rather than fed through resolveEffectivePrice, which would throw for
    // it (see that function's own doc comment: a FIXED variant with no
    // price is a data-entry defect, never silently priced at 0/weight).
    const repriceable = variants.filter((v) => newMode === "WEIGHT_BASED" || v.fixedPricePaise != null);
    if (repriceable.length === 0) return;

    const prices = await this.pricingReader.calculateMany(
      repriceable.map((v) => ({
        pricingMode: newMode,
        weightGrams: v.weightGrams,
        ratePerKgOverridePaise: null,
        // FIXED math needs the variant's existing fixedPricePaise; WEIGHT_BASED math ignores it.
        fixedPricePaise: v.fixedPricePaise,
      })),
    );

    await this.productRepository.repriceVariantsForPricingModeSwitch(
      repriceable.map((v, i) => ({
        id: v.id,
        // WEIGHT_BASED: clears the now-meaningless fixedPricePaise.
        // FIXED: leaves it exactly as the admin already set it.
        fixedPricePaise: newMode === "WEIGHT_BASED" ? null : v.fixedPricePaise,
        effectivePricePaiseCache: prices[i]!.pricePaise,
      })),
    );
    await this.productRepository.recomputeMinPrice(productId);
  }
}
