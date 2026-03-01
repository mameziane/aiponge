import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

interface GetReflectionByIdInput {
  id: string;
  userId: string;
}

export class GetReflectionByIdUseCase {
  async execute(input: GetReflectionByIdInput) {
    const repository = ServiceFactory.createIntelligenceRepository();
    return repository.findReflectionById(input.id, input.userId);
  }
}
