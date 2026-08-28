import type { ListReturnsFilter, ListReturnsResult, ReturnRepositoryPort } from "../ports/return-repository.port";

/** Admin returns queue (week2 (1).md §11's "Admin review" step). */
export class ListReturnsForAdminUseCase {
  constructor(private readonly returnRepository: ReturnRepositoryPort) {}

  execute(filter: ListReturnsFilter): Promise<ListReturnsResult> {
    return this.returnRepository.findAllPaginated(filter);
  }
}
