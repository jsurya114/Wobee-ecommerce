import type { AppConfigRecord, AppConfigRepositoryPort } from "../ports/app-config-repository.port";

/** Full store settings — admin Settings page (MANAGE_SETTINGS) and in-process readers (checkout's minimum quantity, the returns flag). */
export class GetAppConfigUseCase {
  constructor(private readonly repository: AppConfigRepositoryPort) {}

  execute(): Promise<AppConfigRecord> {
    return this.repository.get();
  }
}
