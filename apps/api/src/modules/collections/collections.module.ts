// Composition root for the collections module (ARCHITECTURE.md §3.2).
// Owns (ADR-010): Collection, ProductCollection.
// Week 2 Day 1: listing + slug lookup only. Week 2 Day 2 (week2 (1).md §4)
// adds: customer detail (GET /api/v1/collections/:slug — the product rail
// itself is served by products' own ?collection= filter, not duplicated
// here) + admin CRUD/assign/remove/reorder, exported below for the `admin`
// module's thin HTTP gateway to wire up (ADR-025 — same pattern
// admin.module.ts already uses for orders). Admin UI in apps/admin is
// deferred to Week 2 Day 7 (Module 16, Admin Product Management) — building
// a duplicate product-picker now, before that day's real one lands, would
// be scope creep untethered from the rest of the admin app; the API is
// complete and tested today.
import { GetCollectionDetailUseCase } from "./application/use-cases/get-collection-detail.use-case";
import { FindCollectionBySlugUseCase } from "./application/use-cases/find-collection-by-slug.use-case";
import { ListCollectionsUseCase } from "./application/use-cases/list-collections.use-case";
import { AssignCollectionProductUseCase } from "./application/use-cases/admin/assign-collection-product.use-case";
import { CreateCollectionUseCase } from "./application/use-cases/admin/create-collection.use-case";
import { GetCollectionAdminUseCase } from "./application/use-cases/admin/get-collection-admin.use-case";
import { ListCollectionsAdminUseCase } from "./application/use-cases/admin/list-collections-admin.use-case";
import { RemoveCollectionProductUseCase } from "./application/use-cases/admin/remove-collection-product.use-case";
import { ReorderCollectionProductsUseCase } from "./application/use-cases/admin/reorder-collection-products.use-case";
import { SetCollectionActiveUseCase } from "./application/use-cases/admin/set-collection-active.use-case";
import { UpdateCollectionUseCase } from "./application/use-cases/admin/update-collection.use-case";
import { CollectionRepository } from "./infrastructure/repositories/collection.repository";
import { CollectionsController } from "./interface/http/collections.controller";
import { createCollectionsRouter } from "./interface/http/collections.routes";

const collectionRepository = new CollectionRepository();

const listCollectionsUseCase = new ListCollectionsUseCase(collectionRepository);
const getCollectionDetailUseCase = new GetCollectionDetailUseCase(collectionRepository);

/** Exported for cross-module use — see the use-case's own doc comment. */
export const findCollectionBySlugUseCase = new FindCollectionBySlugUseCase(collectionRepository);

// Exported for the admin module's thin HTTP gateway (ADR-025).
export const listCollectionsAdminUseCase = new ListCollectionsAdminUseCase(collectionRepository);
export const getCollectionAdminUseCase = new GetCollectionAdminUseCase(collectionRepository);
export const createCollectionUseCase = new CreateCollectionUseCase(collectionRepository);
export const updateCollectionUseCase = new UpdateCollectionUseCase(collectionRepository);
export const setCollectionActiveUseCase = new SetCollectionActiveUseCase(collectionRepository);
export const assignCollectionProductUseCase = new AssignCollectionProductUseCase(collectionRepository);
export const removeCollectionProductUseCase = new RemoveCollectionProductUseCase(collectionRepository);
export const reorderCollectionProductsUseCase = new ReorderCollectionProductsUseCase(collectionRepository);

const collectionsController = new CollectionsController(listCollectionsUseCase, getCollectionDetailUseCase);

export const router = createCollectionsRouter(collectionsController);
