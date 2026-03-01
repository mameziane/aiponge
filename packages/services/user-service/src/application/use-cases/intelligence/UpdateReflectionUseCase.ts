import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

interface UpdateReflectionInput {
  id: string;
  userId: string;
  data: Record<string, unknown>;
}

export class UpdateReflectionUseCase {
  async execute(input: UpdateReflectionInput) {
    const repository = ServiceFactory.createIntelligenceRepository();
    await repository.updateReflection(input.id, input.data);
    return repository.findReflectionById(input.id, input.userId);
  }
}
