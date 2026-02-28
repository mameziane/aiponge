export * from './base';
export * from './library';
export * from './music';
export * from './user';
export * from './auth';
export * from './config';
export * from './admin';

import { z, ZodType } from 'zod';

import {
  ListEntriesResponseSchema,
  ListBooksResponseSchema,
  ListChaptersResponseSchema,
  BookResponseSchema,
  EntryResponseSchema,
  BookGenerationAccessResponseSchema,
  BookGenerationCreateResponseSchema,
  BookGenerationStatusResponseSchema,
  BookGenerationRegenerateResponseSchema,
  BookTypesResponseSchema,
  LibraryExploreResponseSchema,
  BookmarksResponseSchema,
  MyLibraryResponseSchema,
  LibraryPrivateResponseSchema,
  ShareToPublicResponseSchema,
  MoveToPublicResponseSchema,
  AssignEntriesResponseSchema,
  CreateEntryResponseSchema,
  UpdateEntryResponseSchema,
  DeleteEntryResponseSchema,
  EntryIllustrationResponseSchema,
  BookTemplatesResponseSchema,
} from './library';
import {
  ListAlbumRequestsResponseSchema,
  ListUserTracksResponseSchema,
  ListUserAlbumsResponseSchema,
  ListPlaylistsResponseSchema,
  UserTrackResponseSchema,
  UserAlbumResponseSchema,
  PlaylistResponseSchema,
  AddTracksToPlaylistResponseSchema,
  TrackArtworkResponseSchema,
} from './music';
import {
  CreditBalanceResponseSchema,
  CreditPolicyResponseSchema,
  ProfileResponseSchema,
  ListInsightsResponseSchema,
  ListRemindersResponseSchema,
  ReminderResponseSchema,
  WellnessResponseSchema,
  PreferencesResponseSchema,
  CreditTransactionsResponseSchema,
  CreditGrantResponseSchema,
  CreditValidateResponseSchema,
  BookReminderResponseSchema,
  OnboardingCompleteResponseSchema,
  ActivityAlarmsResponseSchema,
  ActivityCalendarResponseSchema,
  ContentGenerateResponseSchema,
  ReportsInsightsResponseSchema,
} from './user';
import {
  MeResponseSchema,
  GuestConversionStateSchema,
  GuestConversionPolicySchema,
  LoginResponseSchema,
  RegisterResponseSchema,
  GuestResponseSchema,
  LogoutResponseSchema,
  SmsCodeSendResponseSchema,
  SmsCodeVerifyResponseSchema,
  DeleteAccountResponseSchema,
} from './auth';
import { HealthResponseSchema, ListFrameworksResponseSchema } from './config';
import {
  RiskStatsResponseSchema,
  RiskFlagsResponseSchema,
  ComplianceStatsResponseSchema,
  MonitoringConfigResponseSchema,
  MusicApiCreditsResponseSchema,
  TemplatesListResponseSchema,
  TemplateResponseSchema,
  TemplateCategoriesResponseSchema,
  ProviderConfigResponseSchema,
  ProviderHealthCheckResponseSchema,
  DevResetResponseSchema,
  TestOpenAICreditsResponseSchema,
} from './admin';
import { SuccessResponseSchema } from './base';

export const API_CONTRACTS: Record<string, ZodType<unknown>> = {
  'GET /api/v1/app/library/entries': ListEntriesResponseSchema,
  'GET /api/v1/app/library/chapters': ListChaptersResponseSchema,
  'GET /api/v1/app/library/books': ListBooksResponseSchema,
  'GET /api/v1/app/music/album-requests/active/all': ListAlbumRequestsResponseSchema,
  'GET /api/v1/app/library/user-tracks': ListUserTracksResponseSchema,
  'GET /api/v1/app/library/user-albums': ListUserAlbumsResponseSchema,
  'GET /api/v1/app/playlists': ListPlaylistsResponseSchema,
  'GET /api/v1/app/credits/balance': CreditBalanceResponseSchema,
  'GET /api/v1/app/credits/policy': CreditPolicyResponseSchema,
  'GET /api/v1/app/profile': ProfileResponseSchema,
  'GET /api/v1/app/insights': ListInsightsResponseSchema,
  'GET /api/v1/app/reminders': ListRemindersResponseSchema,
  'GET /api/v1/app/config/frameworks': ListFrameworksResponseSchema,
  'GET /api/v1/auth/me': MeResponseSchema,
  'GET /api/v1/app/guest-conversion/state': GuestConversionStateSchema,
  'GET /api/v1/app/guest-conversion/policy': GuestConversionPolicySchema,
  'GET /api/v1/health': HealthResponseSchema,
  'POST /api/v1/auth/login': LoginResponseSchema,
  'POST /api/v1/auth/register': RegisterResponseSchema,
  'POST /api/v1/auth/guest': GuestResponseSchema,
  'GET /api/v1/app/books/generate/blueprints': BookTemplatesResponseSchema,
  'GET /api/v1/app/books/generate/access': BookGenerationAccessResponseSchema,
  'POST /api/v1/app/books/generate': BookGenerationCreateResponseSchema,
  'POST /api/v1/auth/logout': LogoutResponseSchema,
  'POST /api/v1/auth/sms/send-code': SmsCodeSendResponseSchema,
  'POST /api/v1/auth/sms/verify-code': SmsCodeVerifyResponseSchema,
  'DELETE /api/v1/auth/delete-account': DeleteAccountResponseSchema,
  'GET /api/v1/app/profile/wellness': WellnessResponseSchema,
  'GET /api/v1/app/profile/preferences': PreferencesResponseSchema,
  'PATCH /api/v1/app/profile/preferences': PreferencesResponseSchema,
  'GET /api/v1/app/credits/transactions': CreditTransactionsResponseSchema,
  'POST /api/v1/app/credits/grant-revenuecat': CreditGrantResponseSchema,
  'POST /api/v1/app/credits/validate': CreditValidateResponseSchema,
  'GET /api/v1/app/reminders/book': BookReminderResponseSchema,
  'POST /api/v1/app/reminders/book': BookReminderResponseSchema,
  'POST /api/v1/app/onboarding/complete': OnboardingCompleteResponseSchema,
  'GET /api/v1/app/activity/alarms': ActivityAlarmsResponseSchema,
  'GET /api/v1/app/activity/calendar': ActivityCalendarResponseSchema,
  'POST /api/v1/app/content/generate': ContentGenerateResponseSchema,
  'GET /api/v1/app/reports/insights': ReportsInsightsResponseSchema,
  'GET /api/v1/app/library/book-types': BookTypesResponseSchema,
  'GET /api/v1/app/library/explore': LibraryExploreResponseSchema,
  'GET /api/v1/app/library/private': LibraryPrivateResponseSchema,
  'GET /api/v1/app/library/user': MyLibraryResponseSchema,
  'GET /api/v1/app/library/bookmarks': BookmarksResponseSchema,
  'POST /api/v1/app/library/entries/assign': AssignEntriesResponseSchema,
  'POST /api/v1/app/library/share-to-public': ShareToPublicResponseSchema,
  'POST /api/v1/app/library/admin/move-to-public': MoveToPublicResponseSchema,
  'POST /api/v1/app/entries': CreateEntryResponseSchema,
  'GET /api/v1/app/entries': ListEntriesResponseSchema,
  'GET /api/v1/admin/safety/risk-stats': RiskStatsResponseSchema,
  'GET /api/v1/admin/safety/risk-flags': RiskFlagsResponseSchema,
  'GET /api/v1/admin/safety/compliance-stats': ComplianceStatsResponseSchema,
  'POST /api/v1/admin/monitoring-config': MonitoringConfigResponseSchema,
  'POST /api/v1/admin/musicapi-credits/refresh': MusicApiCreditsResponseSchema,
  'GET /api/v1/librarian/templates': TemplatesListResponseSchema,
  'POST /api/v1/dev/reset': DevResetResponseSchema,
  'GET /api/v1/app/test-openai-credits': TestOpenAICreditsResponseSchema,
  'GET /api/v1/frameworks': ListFrameworksResponseSchema,
  'POST /api/v1/app/reminders/push-token': SuccessResponseSchema,
  'POST /api/v1/app/reminders': ReminderResponseSchema,
};

const DYNAMIC_CONTRACTS: Array<{ pattern: RegExp; method: string; schema: ZodType<unknown> }> = [
  { pattern: /^\/api\/v1\/app\/books\/generate\/[^/]+$/, method: 'GET', schema: BookGenerationStatusResponseSchema },
  {
    pattern: /^\/api\/v1\/app\/books\/generate\/[^/]+\/regenerate$/,
    method: 'POST',
    schema: BookGenerationRegenerateResponseSchema,
  },
  { pattern: /^\/api\/v1\/app\/entries\/[^/]+$/, method: 'PATCH', schema: UpdateEntryResponseSchema },
  { pattern: /^\/api\/v1\/app\/entries\/[^/]+$/, method: 'DELETE', schema: DeleteEntryResponseSchema },
  {
    pattern: /^\/api\/v1\/app\/entries\/[^/]+\/illustrations$/,
    method: 'POST',
    schema: EntryIllustrationResponseSchema,
  },
  {
    pattern: /^\/api\/v1\/app\/entries\/[^/]+\/illustrations\/[^/]+$/,
    method: 'DELETE',
    schema: SuccessResponseSchema,
  },
  { pattern: /^\/api\/v1\/app\/library\/entries\/[^/]+$/, method: 'PATCH', schema: UpdateEntryResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/entries\/[^/]+$/, method: 'DELETE', schema: DeleteEntryResponseSchema },
  { pattern: /^\/api\/v1\/app\/reminders\/book\/[^/]+$/, method: 'PATCH', schema: BookReminderResponseSchema },
  { pattern: /^\/api\/v1\/app\/reminders\/book\/[^/]+$/, method: 'DELETE', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/app\/reminders\/[0-9a-f-]+$/, method: 'PATCH', schema: ReminderResponseSchema },
  { pattern: /^\/api\/v1\/app\/reminders\/[0-9a-f-]+$/, method: 'DELETE', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/app\/activity\/alarms\/[^/]+$/, method: 'DELETE', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/books\/[^/]+$/, method: 'GET', schema: BookResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/books\/[^/]+\/chapters$/, method: 'GET', schema: ListChaptersResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/schedules\/[^/]+$/, method: 'DELETE', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/books\/[^/]+$/, method: 'PATCH', schema: BookResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/books\/[^/]+$/, method: 'DELETE', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/[^/]+\/progress$/, method: 'GET', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/[^/]+\/progress$/, method: 'PATCH', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/templates\/[^/]+$/, method: 'GET', schema: TemplateResponseSchema },
  { pattern: /^\/api\/v1\/templates\/[^/]+$/, method: 'PATCH', schema: TemplateResponseSchema },
  { pattern: /^\/api\/v1\/librarian\/templates\/[^/]+$/, method: 'GET', schema: TemplateResponseSchema },
  {
    pattern: /^\/api\/v1\/librarian\/templates\/[^/]+\/translations\/[^/]+$/,
    method: 'DELETE',
    schema: SuccessResponseSchema,
  },
  { pattern: /^\/api\/v1\/librarian\/templates\/[^/]+\/translations$/, method: 'PUT', schema: SuccessResponseSchema },
  { pattern: /^\/api\/v1\/providers\/[^/]+$/, method: 'PATCH', schema: ProviderConfigResponseSchema },
  { pattern: /^\/api\/v1\/providers\/[^/]+\/health$/, method: 'POST', schema: ProviderHealthCheckResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/albums\/[^/]+$/, method: 'PATCH', schema: UserAlbumResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/tracks\/[^/]+$/, method: 'PATCH', schema: UserTrackResponseSchema },
  { pattern: /^\/api\/v1\/app\/library\/track\/[^/]+\/artwork$/, method: 'PATCH', schema: TrackArtworkResponseSchema },
  { pattern: /^\/api\/v1\/app\/playlists\/[^/]+\/tracks$/, method: 'POST', schema: AddTracksToPlaylistResponseSchema },
];

export function getContractForEndpoint(method: string, url: string): ZodType<unknown> | null {
  const urlWithoutQuery = url.split('?')[0];
  const key = `${method.toUpperCase()} ${urlWithoutQuery}`;

  if (API_CONTRACTS[key]) {
    return API_CONTRACTS[key];
  }

  for (const { pattern, method: m, schema } of DYNAMIC_CONTRACTS) {
    if (method.toUpperCase() === m && pattern.test(urlWithoutQuery)) {
      return schema;
    }
  }

  return null;
}

export interface ContractValidationResult {
  valid: boolean;
  errors?: z.ZodError;
  endpoint: string;
  method: string;
}

export function validateResponseContract(method: string, url: string, response: unknown): ContractValidationResult {
  const contract = getContractForEndpoint(method, url);
  const urlWithoutQuery = url.split('?')[0];

  if (!contract) {
    return {
      valid: true,
      endpoint: urlWithoutQuery,
      method: method.toUpperCase(),
    };
  }

  const result = contract.safeParse(response);

  if (result.success) {
    return {
      valid: true,
      endpoint: urlWithoutQuery,
      method: method.toUpperCase(),
    };
  }

  return {
    valid: false,
    errors: result.error,
    endpoint: urlWithoutQuery,
    method: method.toUpperCase(),
  };
}

export function formatContractViolation(result: ContractValidationResult): string {
  if (result.valid || !result.errors) return '';

  const issues = result.errors.issues
    .map(issue => {
      const path = issue.path.join('.');
      return `  - ${path || 'root'}: ${issue.message} (expected: ${issue.code})`;
    })
    .join('\n');

  return `API Contract Violation: ${result.method} ${result.endpoint}\n${issues}`;
}
