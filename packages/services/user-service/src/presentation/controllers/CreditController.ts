/**
 * Credit Controller
 * Handles credit balance and transaction operations
 */

import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { CreditRepository, FulfillOrderInput } from '@infrastructure/repositories';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '@config/service-urls';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { emailService } from '@infrastructure/services/EmailService';

const logger = getLogger('credit-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  roles?: string[];
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

function getUserId(req: AuthenticatedRequest): string | undefined {
  return (
    req.params.userId ||
    extractAuthContext(req).userId ||
    req.user?.id ||
    (req.query.userId as string) ||
    req.body?.userId
  );
}

export class CreditController {
  async reserveCredits(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req as AuthenticatedRequest);
      const { amount, description, metadata } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found in request', req);
        return;
      }

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        ServiceErrors.badRequest(res, 'Invalid amount - must be a positive number', req);
        return;
      }

      if (!description || typeof description !== 'string') {
        ServiceErrors.badRequest(res, 'Description is required', req);
        return;
      }

      const creditRepository = ServiceFactory.getCreditRepository();
      const result = await creditRepository.reserveCredits(userId, amount, description, metadata);

      if (!result.success) {
        ServiceErrors.paymentRequired(res, result.error || 'Insufficient credits', req, {
          currentBalance: result.currentBalance,
          code: 'INSUFFICIENT_CREDITS',
        });
        return;
      }

      sendSuccess(res, {
        reservationId: result.transactionId,
        amount,
        currentBalance: result.currentBalance,
      });

      logger.info('Credits reserved', { userId, amount, reservationId: result.transactionId });
    } catch (error) {
      logger.error('Reserve credits error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to reserve credits', req);
      return;
    }
  }

  async settleReservation(req: Request, res: Response): Promise<void> {
    try {
      const reservationId = req.params.reservationId as string;
      const { actualAmount, metadata } = req.body;

      if (!reservationId) {
        ServiceErrors.badRequest(res, 'reservationId is required', req);
        return;
      }

      if (actualAmount === undefined || typeof actualAmount !== 'number' || actualAmount < 0) {
        ServiceErrors.badRequest(res, 'actualAmount must be a non-negative number', req);
        return;
      }

      const creditRepository = ServiceFactory.getCreditRepository();
      const result = await creditRepository.settleReservation(reservationId, actualAmount, metadata);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to settle reservation', req);
        return;
      }

      sendSuccess(res, {
        reservationId,
        settledAmount: result.settledAmount,
        refundedAmount: result.refundedAmount,
        newBalance: result.newBalance,
      });

      logger.info('Reservation settled', {
        reservationId,
        settledAmount: result.settledAmount,
        refundedAmount: result.refundedAmount,
      });
    } catch (error) {
      logger.error('Settle reservation error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to settle reservation', req);
      return;
    }
  }

  async cancelReservation(req: Request, res: Response): Promise<void> {
    try {
      const reservationId = req.params.reservationId as string;
      const { reason } = req.body;

      if (!reservationId) {
        ServiceErrors.badRequest(res, 'reservationId is required', req);
        return;
      }

      const creditRepository = ServiceFactory.getCreditRepository();
      const result = await creditRepository.cancelReservation(reservationId, reason);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to cancel reservation', req);
        return;
      }

      sendSuccess(res, {
        reservationId,
        refundedAmount: result.refundedAmount,
        newBalance: result.newBalance,
      });

      logger.info('Reservation cancelled', { reservationId, refundedAmount: result.refundedAmount });
    } catch (error) {
      logger.error('Cancel reservation error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to cancel reservation', req);
      return;
    }
  }

  async getBalance(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found in request', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get credit balance',
      handler: async () => {
        const useCase = ServiceFactory.createGetCreditBalanceUseCase();
        return useCase.execute({ userId });
      },
    });
  }

  async validateCredits(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);
    const { amount, requiredCredits } = req.body;
    const creditsToValidate = amount || requiredCredits;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found in request', req);
      return;
    }

    if (!creditsToValidate || typeof creditsToValidate !== 'number' || creditsToValidate <= 0) {
      ServiceErrors.badRequest(res, 'Invalid amount - must be a positive number', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to validate credits',
      handler: async () => {
        const useCase = ServiceFactory.createValidateCreditsUseCase();
        return useCase.execute({ userId, amount: creditsToValidate });
      },
    });
  }

  async deductCredits(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req as AuthenticatedRequest);
      const { amount, description, metadata } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found in request', req);
        return;
      }

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        ServiceErrors.badRequest(res, 'Invalid amount - must be a positive number', req);
        return;
      }

      if (!description || typeof description !== 'string') {
        ServiceErrors.badRequest(res, 'Description is required', req);
        return;
      }

      const useCase = ServiceFactory.createDeductCreditsUseCase();
      const result = await useCase.execute({ userId, amount, description, metadata });

      if (!result.success) {
        ServiceErrors.paymentRequired(res, result.error || 'Insufficient credits', req, {
          balance: result.remainingBalance,
        });
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Deduct credits error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to deduct credits', req);
      return;
    }
  }

  async refundCredits(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);
    const { amount, description, metadata } = req.body;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found in request', req);
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      ServiceErrors.badRequest(res, 'Invalid amount - must be a positive number', req);
      return;
    }

    if (!description || typeof description !== 'string') {
      ServiceErrors.badRequest(res, 'Description is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to refund credits',
      handler: async () => {
        const useCase = ServiceFactory.createRefundCreditsUseCase();
        return useCase.execute({ userId, amount, description, metadata });
      },
    });
  }

  async getTransactionHistory(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found in request', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get transaction history',
      handler: async () => {
        const useCase = ServiceFactory.createGetTransactionHistoryUseCase();
        return useCase.execute({ userId, limit, offset });
      },
    });
  }

  async getCreditPolicy(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get credit policy',
      handler: async () => {
        const policy = {
          musicGeneration: {
            costPerSong: 20,
            description: 'Cost per music generation (creates 2 song variations)',
          },
          minimumBalance: {
            required: 0,
            description: 'Minimum balance required to maintain account',
          },
        };

        logger.info('Credit policy retrieved successfully');

        return policy;
      },
    });
  }

  async getProductCatalog(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get product catalog',
      handler: async () => {
        const creditProductRepo = ServiceFactory.getCreditProductRepository();
        const catalog = await creditProductRepo.getProductCatalog();

        logger.info('Product catalog retrieved successfully');

        return {
          creditPacks: catalog.creditPacks.map(p => ({
            id: p.productId,
            name: p.name,
            credits: p.credits,
            priceUsd: p.priceUsd,
            description: p.description,
            popular: p.isPopular,
          })),
          premiumSessions: catalog.premiumSessions.map(p => ({
            id: p.productId,
            name: p.name,
            credits: p.credits,
            priceUsd: p.priceUsd,
            description: p.description,
          })),
          giftCredits: catalog.giftCredits.map(p => ({
            id: p.productId,
            name: p.name,
            credits: p.credits,
            priceUsd: p.priceUsd,
            description: p.description,
          })),
          paymentMethod: catalog.paymentMethod,
        };
      },
    });
  }

  async getProducts(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get products',
      handler: async () => {
        const creditProductRepo = ServiceFactory.getCreditProductRepository();
        const products = await creditProductRepo.getProductsByType('pack');

        logger.info('Products retrieved successfully');

        return {
          products: products.map(p => ({
            id: p.productId,
            name: p.name,
            credits: p.credits,
            priceUsd: p.priceUsd,
            description: p.description,
            popular: p.isPopular,
          })),
          message: 'Products available via in-app purchase',
        };
      },
    });
  }

  async seedProducts(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to seed products',
      handler: async () => {
        const creditProductRepo = ServiceFactory.getCreditProductRepository();
        await creditProductRepo.seedDefaultProducts();

        logger.info('Credit products seeded successfully');

        return { message: 'Default credit products seeded successfully' };
      },
    });
  }

  async fulfillOrder(req: Request, res: Response): Promise<void> {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) {
      ServiceErrors.forbidden(res, 'Internal service access required', req);
      return;
    }

    const {
      userId,
      transactionId,
      originalTransactionId,
      appUserId,
      productType,
      creditsGranted,
      amountPaid,
      currency,
      metadata,
    } = req.body;

    if (!userId || !transactionId || !creditsGranted) {
      ServiceErrors.badRequest(res, 'Missing required fields: userId, transactionId, creditsGranted', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to fulfill order',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        const input: FulfillOrderInput = {
          userId,
          transactionId,
          originalTransactionId,
          appUserId,
          productType: productType || 'credit_pack',
          creditsGranted,
          amountPaid: amountPaid || 0,
          currency: currency || 'usd',
          metadata,
        };

        const result = await creditRepository.fulfillOrder(input);

        logger.info('Order fulfilled', { orderId: result.orderId, userId, creditsGranted });

        return result;
      },
    });
  }

  async claimGift(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req as AuthenticatedRequest);
      const { claimToken } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found', req);
        return;
      }

      if (!claimToken) {
        ServiceErrors.badRequest(res, 'claimToken is required', req);
        return;
      }

      const creditRepository = createDrizzleRepository(CreditRepository);
      const result = await creditRepository.claimGift(claimToken, userId);

      if (!result) {
        ServiceErrors.notFound(res, 'Gift', req);
        return;
      }

      sendSuccess(res, {
        creditsReceived: result.creditsAmount,
        message: `You received ${result.creditsAmount} credits!`,
      });

      logger.info('Gift claimed', { userId, creditsAmount: result.creditsAmount });
    } catch (error) {
      logger.error('Claim gift error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to claim gift', req);
      return;
    }
  }

  async getPendingGifts(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get pending gifts',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        const gifts = await creditRepository.getPendingGiftsForUser(userId);

        return {
          pendingGifts: gifts,
          hasPendingGifts: gifts.length > 0,
          totalCreditsAvailable: gifts.reduce((sum, g) => sum + g.creditsAmount, 0),
        };
      },
    });
  }

  async getOrders(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get orders',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        return creditRepository.getOrders(userId, limit, offset);
      },
    });
  }

  async getSentGifts(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get sent gifts',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        return creditRepository.getSentGifts(userId);
      },
    });
  }

  async getReceivedGifts(req: Request, res: Response): Promise<void> {
    const userId = getUserId(req as AuthenticatedRequest);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized - User ID not found', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get received gifts',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        return creditRepository.getReceivedGifts(userId);
      },
    });
  }

  async getCreditsStats(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get credit statistics',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        return creditRepository.getPlatformCreditStats();
      },
    });
  }

  async sendGift(req: Request, res: Response): Promise<void> {
    ServiceErrors.badRequest(res, 'Gift sending is not yet implemented', req);
  }

  async grantRevenueCatCredits(req: Request, res: Response): Promise<void> {
    ServiceErrors.badRequest(res, 'RevenueCat credit grants are not yet implemented', req);
  }

  async updatePendingOrderTransaction(req: Request, res: Response): Promise<void> {
    const orderId = req.params.orderId as string;
    if (!orderId) {
      ServiceErrors.badRequest(res, 'orderId is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update pending order transaction',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        const { transactionId } = req.body;
        if (!transactionId) {
          throw new Error('transactionId is required');
        }
        return creditRepository.updatePendingOrderTransaction(orderId, transactionId as string);
      },
    });
  }

  async updatePendingOrderStatus(req: Request, res: Response): Promise<void> {
    const orderId = req.params.orderId as string;
    if (!orderId) {
      ServiceErrors.badRequest(res, 'orderId is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update pending order status',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        const { status } = req.body;
        if (!status) {
          throw new Error('status is required');
        }
        return creditRepository.updatePendingOrderStatus(orderId, status as string);
      },
    });
  }

  async createPendingOrder(req: Request, res: Response): Promise<void> {
    const { userId, productId, productType, creditsToGrant, amountPaid, currency, idempotencyKey, status } = req.body;

    if (!userId || !idempotencyKey) {
      ServiceErrors.badRequest(res, 'userId and idempotencyKey are required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create pending order',
      handler: async () => {
        const creditRepository = createDrizzleRepository(CreditRepository);
        const result = await creditRepository.createPendingOrder({
          userId,
          transactionId: '',
          productType: productType || 'credit_pack',
          creditsToGrant: creditsToGrant || 0,
          amountPaid: amountPaid || 0,
          currency: currency || 'usd',
          idempotencyKey,
          status: status || 'pending_payment',
        });

        logger.info('Pending order created', { orderId: result.orderId, userId, idempotencyKey });

        return result;
      },
    });
  }
}
