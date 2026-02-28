import { ServiceName, OperationType, type CrossServiceReference } from './types.js';

export const CROSS_SERVICE_REFERENCES: CrossServiceReference[] = [
  // Music Service -> User Service
  {
    sourceTable: 'mus_playlists',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  {
    sourceTable: 'mus_tracks',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  {
    sourceTable: 'mus_albums',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  {
    sourceTable: 'mus_favorite_tracks',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  // AI Content Service -> User Service
  {
    sourceTable: 'ai_generations',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  {
    sourceTable: 'ai_generations',
    sourceColumn: 'entry_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'lib_entries',
    targetColumn: 'id',
    referenceType: 'entry',
    requiredForCreate: false,
    requiredForUpdate: false,
    cascadeOnDelete: false,
  },
  {
    sourceTable: 'ai_generations',
    sourceColumn: 'chapter_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'lib_chapters',
    targetColumn: 'id',
    referenceType: 'chapter',
    requiredForCreate: false,
    requiredForUpdate: false,
    cascadeOnDelete: false,
  },
  // Analytics Service -> User Service
  {
    sourceTable: 'anl_events',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  {
    sourceTable: 'anl_sessions',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  {
    sourceTable: 'anl_aggregates',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  // Storage Service -> User Service
  {
    sourceTable: 'stg_files',
    sourceColumn: 'user_id',
    targetService: ServiceName.USER_SERVICE,
    targetTable: 'usr_accounts',
    targetColumn: 'id',
    referenceType: 'user',
    requiredForCreate: true,
    requiredForUpdate: false,
    cascadeOnDelete: true,
  },
  // Storage Service -> Music Service (tracks consolidated into mus_tracks with visibility column)
  {
    sourceTable: 'stg_files',
    sourceColumn: 'track_id',
    targetService: ServiceName.MUSIC_SERVICE,
    targetTable: 'mus_tracks',
    targetColumn: 'id',
    referenceType: 'track',
    requiredForCreate: false,
    requiredForUpdate: false,
    cascadeOnDelete: false,
  },
  // Storage Service -> AI Content Service
  {
    sourceTable: 'stg_files',
    sourceColumn: 'generation_id',
    targetService: ServiceName.AI_CONTENT_SERVICE,
    targetTable: 'ai_generations',
    targetColumn: 'id',
    referenceType: 'generation',
    requiredForCreate: false,
    requiredForUpdate: false,
    cascadeOnDelete: false,
  },
];

export function getReferencesForTable(tableName: string): CrossServiceReference[] {
  return CROSS_SERVICE_REFERENCES.filter(ref => ref.sourceTable === tableName);
}

export function getReferencesForService(serviceName: ServiceName): CrossServiceReference[] {
  return CROSS_SERVICE_REFERENCES.filter(ref => ref.targetService === serviceName);
}

export function getReferencesRequiringValidation(tableName: string, operation: OperationType): CrossServiceReference[] {
  const refs = getReferencesForTable(tableName);

  switch (operation) {
    case OperationType.CREATE:
      return refs.filter(ref => ref.requiredForCreate);
    case OperationType.UPDATE:
      return refs.filter(ref => ref.requiredForUpdate);
    case OperationType.DELETE:
      return refs.filter(ref => ref.cascadeOnDelete);
    default:
      return [];
  }
}
