import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

interface DeleteReflectionInput {
  id: string;
  userId: string;
}

export class DeleteReflectionUseCase {
  async execute(input: DeleteReflectionInput) {
    const repository = ServiceFactory.createIntelligenceRepository();
    await repository.deleteReflection(input.id, input.userId);
    return { deleted: true };
  }
}
