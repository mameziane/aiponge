import { eq, desc, and, gte } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { usrMoodCheckins } from '../../database/schemas/profile-schema';
import type { MoodCheckin, NewMoodCheckin } from '../../../domains/insights/types';
import { getLogger } from '../../../config/service-urls';
import { ProfileError } from '../../../application/errors/errors';

const logger = getLogger('intelligence-repository');

export class MoodCheckinRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async createMoodCheckin(checkinData: NewMoodCheckin): Promise<MoodCheckin> {
    const moodCheckinsTable = usrMoodCheckins;
    const [checkin] = await this.db.insert(moodCheckinsTable).values(checkinData).returning();
    logger.info('Mood check-in created', { id: checkin.id, userId: checkin.userId, mood: checkin.mood });
    return checkin;
  }

  async findMoodCheckinsByUserId(userId: string, limit: number = 50): Promise<MoodCheckin[]> {
    const moodCheckinsTable = usrMoodCheckins;
    return this.db
      .select()
      .from(moodCheckinsTable)
      .where(eq(moodCheckinsTable.userId, userId))
      .orderBy(desc(moodCheckinsTable.createdAt))
      .limit(Math.min(limit, 100));
  }

  async updateMoodCheckin(id: string, data: Partial<MoodCheckin>): Promise<MoodCheckin> {
    const moodCheckinsTable = usrMoodCheckins;
    const [checkin] = await this.db
      .update(moodCheckinsTable)
      .set(data)
      .where(eq(moodCheckinsTable.id, id))
      .returning();
    if (!checkin) throw ProfileError.notFound('MoodCheckin', id);
    return checkin;
  }

  async findRecentMoodCheckins(userId: string, days: number): Promise<MoodCheckin[]> {
    const moodCheckinsTable = usrMoodCheckins;
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.db
      .select()
      .from(moodCheckinsTable)
      .where(and(eq(moodCheckinsTable.userId, userId), gte(moodCheckinsTable.createdAt, since)))
      .orderBy(desc(moodCheckinsTable.createdAt));
  }
}
