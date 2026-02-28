import { Router, Request, Response } from 'express';
import { createLogger } from '@aiponge/platform-core';
import { normalizeRole, Result } from '@aiponge/shared-contracts';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';
import { createContentAccessContext } from '@application/use-cases/library';
import { DEFAULT_GUEST_CONVERSION_POLICY } from '@infrastructure/database/schemas/subscription-schema';

const logger = createLogger('composite-routes');

export function registerCompositeRoutes(router: Router): void {
  router.get('/users/:userId/init', async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[INIT] Fetching composite startup data', { userId, requestId });

    const startTime = Date.now();

    try {
      const [
        profileResult,
        creditsBalanceResult,
        creditsPolicyResult,
        guestConversionPolicyResult,
        recentEntriesResult,
      ] = await Promise.allSettled([
        (async () => {
          const useCase = ServiceFactory.createGetUserProfileUseCase();
          return useCase.execute({ userId });
        })(),

        (async () => {
          const useCase = ServiceFactory.createGetCreditBalanceUseCase();
          return useCase.execute({ userId });
        })(),

        (async () => {
          return {
            musicGeneration: {
              costPerSong: 20,
              description: 'Cost per music generation (creates 2 song variations)',
            },
            minimumBalance: {
              required: 0,
              description: 'Minimum balance required to maintain account',
            },
          };
        })(),

        (async () => {
          const repo = ServiceFactory.getGuestConversionRepository();
          const policyResult = await repo.getActivePolicy();
          if (Result.isFail(policyResult)) {
            return {
              firstSongThreshold: DEFAULT_GUEST_CONVERSION_POLICY.firstSongThreshold,
              tracksPlayedThreshold: DEFAULT_GUEST_CONVERSION_POLICY.tracksPlayedThreshold,
              entriesCreatedThreshold: DEFAULT_GUEST_CONVERSION_POLICY.entriesCreatedThreshold,
              promptCooldownMs: DEFAULT_GUEST_CONVERSION_POLICY.promptCooldownMs,
              promptMessages: DEFAULT_GUEST_CONVERSION_POLICY.promptMessages,
            };
          }
          return (
            policyResult.data || {
              firstSongThreshold: DEFAULT_GUEST_CONVERSION_POLICY.firstSongThreshold,
              tracksPlayedThreshold: DEFAULT_GUEST_CONVERSION_POLICY.tracksPlayedThreshold,
              entriesCreatedThreshold: DEFAULT_GUEST_CONVERSION_POLICY.entriesCreatedThreshold,
              promptCooldownMs: DEFAULT_GUEST_CONVERSION_POLICY.promptCooldownMs,
              promptMessages: DEFAULT_GUEST_CONVERSION_POLICY.promptMessages,
            }
          );
        })(),

        (async () => {
          const userRole = normalizeRole(req.headers['x-user-role'] as string);
          const useCase = ServiceFactory.createListEntriesUseCase();
          const context = createContentAccessContext(userId, userRole);
          const result = await useCase.executeByUser(context, { limit: 20, offset: 0 });
          if (result.success === true) {
            return result.data.entries.map((e: { entry: unknown; illustrations: unknown }) => ({
              ...(e.entry as Record<string, unknown>),
              images: e.illustrations,
            }));
          }
          return [];
        })(),
      ]);

      const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const creditsBalance = creditsBalanceResult.status === 'fulfilled' ? creditsBalanceResult.value : null;
      const creditsPolicy = creditsPolicyResult.status === 'fulfilled' ? creditsPolicyResult.value : null;
      const guestConversionPolicy =
        guestConversionPolicyResult.status === 'fulfilled' ? guestConversionPolicyResult.value : null;
      const recentEntries = recentEntriesResult.status === 'fulfilled' ? recentEntriesResult.value : [];

      const duration = Date.now() - startTime;

      logger.info('[INIT] Composite startup data fetched', {
        userId,
        requestId,
        duration,
        hasProfile: !!profile,
        hasCreditsBalance: !!creditsBalance,
        hasCreditsPolicy: !!creditsPolicy,
        hasGuestConversionPolicy: !!guestConversionPolicy,
        entriesCount: Array.isArray(recentEntries) ? recentEntries.length : 0,
      });

      sendSuccess(res, {
        profile,
        credits: {
          balance: creditsBalance,
          policy: creditsPolicy,
        },
        guestConversionPolicy,
        recentEntries,
      });
    } catch (error) {
      logger.error('[INIT] Failed to fetch composite startup data', {
        userId,
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch startup data', req);
    }
  });
}
