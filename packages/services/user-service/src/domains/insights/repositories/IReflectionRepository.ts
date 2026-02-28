/**
 * Reflection Repository Interface
 * User reflections and contemplations
 */

import { Reflection, NewReflection } from '@domains/insights/types';

export interface IReflectionRepository {
  createReflection(reflection: NewReflection): Promise<Reflection>;
  findReflectionsByUserId(userId: string, limit?: number): Promise<Reflection[]>;
  updateReflection(id: string, data: Partial<Reflection>): Promise<Reflection>;
}
