import type { AppConfigValues } from "../../domain/app-config";

export interface AppConfigRecord extends AppConfigValues {
  /** null when the singleton row has never been saved (defaults are in effect). */
  updatedAt: Date | null;
}

/** application depends on this interface, not on Prisma directly (ARCHITECTURE.md §3.1). */
export interface AppConfigRepositoryPort {
  /** Never throws for a missing row — returns DEFAULT_APP_CONFIG instead. */
  get(): Promise<AppConfigRecord>;
  /** Upserts the singleton row with the given fields; untouched fields keep their current value. */
  update(patch: Partial<AppConfigValues>): Promise<AppConfigRecord>;
}
