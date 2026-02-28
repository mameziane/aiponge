import { Persona, InsertPersona } from '@domains/insights/types';

export interface PersonaFilter {
  isActive?: boolean;
  version?: string;
  minConfidence?: number;
  limit?: number;
}

export interface IPersonaRepository {
  findById(id: string): Promise<Persona | null>;
  findByUserId(userId: string, filter?: PersonaFilter): Promise<Persona[]>;
  findActivePersona(userId: string): Promise<Persona | null>;
  findLatestPersona(userId: string): Promise<Persona | null>;
  create(persona: InsertPersona): Promise<Persona>;
  update(id: string, updates: Partial<InsertPersona>): Promise<Persona | null>;
  deactivateAll(userId: string): Promise<number>;
  deleteByUserId(userId: string): Promise<number>;
}
