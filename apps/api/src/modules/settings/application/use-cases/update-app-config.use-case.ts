import type { UpdateAppConfigInput } from "@woobe/validation";
import type { AppConfigRecord, AppConfigRepositoryPort } from "../ports/app-config-repository.port";

/** Admin Settings write (MANAGE_SETTINGS, super_admin only). Takes effect on the very next request — nothing caches AppConfig. */
export class UpdateAppConfigUseCase {
  constructor(private readonly repository: AppConfigRepositoryPort) {}

  execute(patch: UpdateAppConfigInput): Promise<AppConfigRecord> {
    return this.repository.update(patch);
  }
}
