import { type Prisma, prisma } from "@woobe/database";
import { DEFAULT_APP_CONFIG, joinPresetList, parseBudgetTiles, splitPresetList, type AppConfigValues } from "../../domain/app-config";
import type { AppConfigRecord, AppConfigRepositoryPort } from "../../application/ports/app-config-repository.port";

const SINGLETON_ID = "singleton";

type AppConfigRow = {
  minCartQuantity: number;
  presetSizes: string;
  presetFabrics: string;
  presetFits: string;
  returnsEnabled: boolean;
  codShippingUpfront: boolean;
  budgetTiles: Prisma.JsonValue;
  updatedAt: Date;
};

/** ADR-010: the ONLY file in the settings module allowed to import @woobe/database. */
export class AppConfigRepository implements AppConfigRepositoryPort {
  async get(): Promise<AppConfigRecord> {
    const row = await prisma.appConfig.findUnique({ where: { id: SINGLETON_ID } });
    return row ? toRecord(row) : { ...DEFAULT_APP_CONFIG, updatedAt: null };
  }

  async update(patch: Partial<AppConfigValues>): Promise<AppConfigRecord> {
    const data = {
      ...(patch.minCartQuantity !== undefined ? { minCartQuantity: patch.minCartQuantity } : {}),
      ...(patch.presetSizes !== undefined ? { presetSizes: joinPresetList(patch.presetSizes) } : {}),
      ...(patch.presetFabrics !== undefined ? { presetFabrics: joinPresetList(patch.presetFabrics) } : {}),
      ...(patch.presetFits !== undefined ? { presetFits: joinPresetList(patch.presetFits) } : {}),
      ...(patch.returnsEnabled !== undefined ? { returnsEnabled: patch.returnsEnabled } : {}),
      ...(patch.codShippingUpfront !== undefined ? { codShippingUpfront: patch.codShippingUpfront } : {}),
      ...(patch.budgetTiles !== undefined
        ? { budgetTiles: patch.budgetTiles.map((tile) => ({ label: tile.label, maxPricePaise: tile.maxPricePaise, coverImageUrl: tile.coverImageUrl })) }
        : {}),
    };
    // Upsert: the first save creates the row (every column not in `data`
    // takes its schema default, which equals DEFAULT_APP_CONFIG).
    const row = await prisma.appConfig.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID, ...data }, update: data });
    return toRecord(row);
  }
}

function toRecord(row: AppConfigRow): AppConfigRecord {
  return {
    minCartQuantity: row.minCartQuantity,
    presetSizes: splitPresetList(row.presetSizes),
    presetFabrics: splitPresetList(row.presetFabrics),
    presetFits: splitPresetList(row.presetFits),
    returnsEnabled: row.returnsEnabled,
    codShippingUpfront: row.codShippingUpfront,
    budgetTiles: parseBudgetTiles(row.budgetTiles),
    updatedAt: row.updatedAt,
  };
}
