import type { AiGenerationEntity } from "../../domain/ai-image";
import type { AiImageRepositoryPort } from "../ports/ai-image-repository.port";

export class ListGenerationsUseCase {
  constructor(private readonly repository: AiImageRepositoryPort) {}

  execute(productId: string): Promise<AiGenerationEntity[]> {
    return this.repository.listForProduct(productId);
  }
}
