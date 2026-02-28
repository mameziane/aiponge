import { encryptionService } from '../../services/EncryptionService';

const SENSITIVE_ENTRY_FIELDS = ['content'] as const;
const SENSITIVE_INSIGHT_FIELDS = ['content'] as const;
const SENSITIVE_REFLECTION_FIELDS = ['content'] as const;

type SensitiveEntryField = (typeof SENSITIVE_ENTRY_FIELDS)[number];
type SensitiveInsightField = (typeof SENSITIVE_INSIGHT_FIELDS)[number];
type SensitiveReflectionField = (typeof SENSITIVE_REFLECTION_FIELDS)[number];

import type { Entry, InsertEntry } from '../../../domains/library/types';
import type { Insight, NewInsight, Reflection, NewReflection } from '../../../domains/insights/types';

export function encryptEntryData(data: InsertEntry): InsertEntry {
  const encrypted = { ...data };
  for (const field of SENSITIVE_ENTRY_FIELDS) {
    const value = encrypted[field as SensitiveEntryField];
    if (value) {
      (encrypted as Record<string, unknown>)[field] = encryptionService.encrypt(value);
    }
  }
  return encrypted;
}

export function decryptEntry(entry: Entry): Entry {
  const decrypted = { ...entry };
  for (const field of SENSITIVE_ENTRY_FIELDS) {
    const value = decrypted[field as SensitiveEntryField];
    if (value) {
      (decrypted as Record<string, unknown>)[field] = encryptionService.decrypt(value);
    }
  }
  return decrypted;
}

export function decryptEntries(entryList: Entry[]): Entry[] {
  return entryList.map(e => decryptEntry(e));
}

export function encryptInsightData(data: NewInsight): NewInsight {
  const encrypted = { ...data };
  for (const field of SENSITIVE_INSIGHT_FIELDS) {
    const value = encrypted[field as SensitiveInsightField];
    if (value) {
      (encrypted as Record<string, unknown>)[field] = encryptionService.encrypt(value);
    }
  }
  return encrypted;
}

export function decryptInsight(insight: Insight): Insight {
  const decrypted = { ...insight };
  for (const field of SENSITIVE_INSIGHT_FIELDS) {
    const value = decrypted[field as SensitiveInsightField];
    if (value) {
      (decrypted as Record<string, unknown>)[field] = encryptionService.decrypt(value);
    }
  }
  return decrypted;
}

export function decryptInsights(insightList: Insight[]): Insight[] {
  return insightList.map(i => decryptInsight(i));
}

export function encryptReflectionData(data: NewReflection): NewReflection {
  const encrypted = { ...data };
  for (const field of SENSITIVE_REFLECTION_FIELDS) {
    const value = encrypted[field as SensitiveReflectionField];
    if (value) {
      (encrypted as Record<string, unknown>)[field] = encryptionService.encrypt(value);
    }
  }
  return encrypted;
}

export function decryptReflection(reflection: Reflection): Reflection {
  const decrypted = { ...reflection };
  for (const field of SENSITIVE_REFLECTION_FIELDS) {
    const value = decrypted[field as SensitiveReflectionField];
    if (value) {
      (decrypted as Record<string, unknown>)[field] = encryptionService.decrypt(value);
    }
  }
  return decrypted;
}

export function decryptReflections(reflectionList: Reflection[]): Reflection[] {
  return reflectionList.map(r => decryptReflection(r));
}

export { encryptionService };
