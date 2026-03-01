import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

interface GetNarrativeHistoryInput {
  userId: string;
  limit?: number;
}

export class GetNarrativeHistoryUseCase {
  async execute(input: GetNarrativeHistoryInput) {
    const repository = ServiceFactory.createIntelligenceRepository();
    const narratives = await repository.findNarrativesByUserId(input.userId, input.limit ?? 20);
    return { narratives, count: narratives.length };
  }
}
