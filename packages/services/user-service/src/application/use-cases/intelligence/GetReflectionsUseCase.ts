import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

interface GetReflectionsInput {
  userId: string;
}

export class GetReflectionsUseCase {
  async execute(input: GetReflectionsInput) {
    const repository = ServiceFactory.createIntelligenceRepository();
    const reflections = await repository.findReflectionsByUserId(input.userId);
    return { reflections };
  }
}
