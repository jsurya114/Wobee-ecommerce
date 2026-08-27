// Composition root for the collections module (ARCHITECTURE.md §3.2).
// Owns (ADR-010): Collection, ProductCollection.
// Week 2 Day 1: listing only (GET /api/v1/collections) + the cross-module
// slug lookup products' catalogue filter needs. Detail pages, product
// rails, and admin CRUD are Day 2 (week2 (1).md §4) — built on the same
// repository, not a rewrite.
import { FindCollectionBySlugUseCase } from "./application/use-cases/find-collection-by-slug.use-case";
import { ListCollectionsUseCase } from "./application/use-cases/list-collections.use-case";
import { CollectionRepository } from "./infrastructure/repositories/collection.repository";
import { CollectionsController } from "./interface/http/collections.controller";
import { createCollectionsRouter } from "./interface/http/collections.routes";

const collectionRepository = new CollectionRepository();

const listCollectionsUseCase = new ListCollectionsUseCase(collectionRepository);

/** Exported for cross-module use — see the use-case's own doc comment. */
export const findCollectionBySlugUseCase = new FindCollectionBySlugUseCase(collectionRepository);

const collectionsController = new CollectionsController(listCollectionsUseCase);

export const router = createCollectionsRouter(collectionsController);
