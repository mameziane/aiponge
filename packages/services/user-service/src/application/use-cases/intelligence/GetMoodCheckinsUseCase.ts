import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

interface GetMoodCheckinsInput {
  userId: string;
  limit?: number;
}

export class GetMoodCheckinsUseCase {
  async execute(input: GetMoodCheckinsInput) {
    const repository = ServiceFactory.createIntelligenceRepository();
    const checkins = await repository.findMoodCheckinsByUserId(input.userId, input.limit ?? 50);
    return { checkins, count: checkins.length };
  }
}
