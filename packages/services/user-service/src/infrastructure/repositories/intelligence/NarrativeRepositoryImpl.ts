import { eq, desc } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { usrPersonalNarratives } from '../../database/schemas/profile-schema';
import type { PersonalNarrative, NewPersonalNarrative } from '../../../domains/insights/types';
import { getLogger } from '../../../config/service-urls';
import { ProfileError } from '../../../application/errors/errors';

const logger = getLogger('intelligence-repository');

export class NarrativeRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async createPersonalNarrative(narrativeData: NewPersonalNarrative): Promise<PersonalNarrative> {
    const narrativesTable = usrPersonalNarratives;
    const [narrative] = await this.db.insert(narrativesTable).values(narrativeData).returning();
    logger.info('Personal narrative created', { id: narrative.id, userId: narrative.userId });
    return narrative;
  }

  async findLatestNarrative(userId: string): Promise<PersonalNarrative | null> {
    const narrativesTable = usrPersonalNarratives;
    const [narrative] = await this.db
      .select()
      .from(narrativesTable)
      .where(eq(narrativesTable.userId, userId))
      .orderBy(desc(narrativesTable.periodEnd))
      .limit(1);
    return narrative || null;
  }

  async findNarrativesByUserId(userId: string, limit: number = 20): Promise<PersonalNarrative[]> {
    const narrativesTable = usrPersonalNarratives;
    return this.db
      .select()
      .from(narrativesTable)
      .where(eq(narrativesTable.userId, userId))
      .orderBy(desc(narrativesTable.periodEnd))
      .limit(Math.min(limit, 50));
  }

  async updateNarrative(id: string, data: Partial<PersonalNarrative>): Promise<PersonalNarrative> {
    const narrativesTable = usrPersonalNarratives;
    const [narrative] = await this.db.update(narrativesTable).set(data).where(eq(narrativesTable.id, id)).returning();
    if (!narrative) throw ProfileError.notFound('PersonalNarrative', id);
    return narrative;
  }
}
