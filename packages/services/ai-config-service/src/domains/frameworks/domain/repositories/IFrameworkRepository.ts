/**
 * Framework Repository Interface
 */

import { PsychologicalFramework, FrameworkFilter } from '../entities/PsychologicalFramework';

export interface IFrameworkRepository {
  findAll(filter?: FrameworkFilter): Promise<PsychologicalFramework[]>;
  findById(id: string): Promise<PsychologicalFramework | null>;
  findByCategory(category: string): Promise<PsychologicalFramework[]>;
  findEnabled(): Promise<PsychologicalFramework[]>;
}
