import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { ICreditRepository, ReserveCreditResult } from '../../../domains/credits/repositories/ICreditRepository';
import { UserCredits, CreditBalance, CreditTransaction } from '../../../domains/credits/entities';
import { BalanceRepository } from './BalanceRepository';
import { ReservationRepository } from './ReservationRepository';
import { TransactionRepository } from './TransactionRepository';
import { OrderRepository, FulfillOrderInput, CreatePendingOrderInput } from './OrderRepository';
import { GiftRepository, CreateGiftInput } from './GiftRepository';

export type { FulfillOrderInput, CreatePendingOrderInput } from './OrderRepository';
export type { CreateGiftInput } from './GiftRepository';

export class CreditRepository implements ICreditRepository {
  private readonly balance: BalanceRepository;
  private readonly reservation: ReservationRepository;
  private readonly transaction: TransactionRepository;
  private readonly order: OrderRepository;
  private readonly gift: GiftRepository;

  constructor(db: DatabaseConnection) {
    this.balance = new BalanceRepository(db);
    this.reservation = new ReservationRepository(db);
    this.transaction = new TransactionRepository(db);
    this.order = new OrderRepository(db);
    this.gift = new GiftRepository(db);
  }

  async initializeCredits(userId: string, startingBalance: number): Promise<UserCredits> {
    return this.balance.initializeCredits(userId, startingBalance);
  }

  async getBalance(userId: string): Promise<CreditBalance | null> {
    return this.balance.getBalance(userId);
  }

  async hasCredits(userId: string): Promise<boolean> {
    return this.balance.hasCredits(userId);
  }

  async addCredits(
    userId: string,
    amount: number,
    type: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<CreditTransaction> {
    return this.balance.addCredits(userId, amount, type, description, metadata) as Promise<CreditTransaction>;
  }

  async getPlatformCreditStats() {
    return this.balance.getPlatformCreditStats();
  }

  async reserveCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<ReserveCreditResult> {
    return this.reservation.reserveCredits(userId, amount, description, metadata);
  }

  async commitReservation(transactionId: string): Promise<void> {
    return this.reservation.commitReservation(transactionId);
  }

  async cancelReservation(
    transactionId: string,
    reason?: string
  ): Promise<{ success: boolean; refundedAmount?: number; newBalance?: number; error?: string }> {
    return this.reservation.cancelReservation(transactionId, reason);
  }

  async settleReservation(
    transactionId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    settledAmount?: number;
    refundedAmount?: number;
    newBalance?: number;
    error?: string;
  }> {
    return this.reservation.settleReservation(transactionId, actualAmount, metadata);
  }

  async cleanupOrphanedReservations(olderThanMinutes?: number): Promise<number> {
    return this.reservation.cleanupOrphanedReservations(olderThanMinutes);
  }

  async refundCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<CreditTransaction> {
    return this.transaction.refundCredits(userId, amount, description, metadata);
  }

  async getTransactionHistory(
    userId: string,
    limit?: number,
    offset?: number
  ): Promise<{ transactions: CreditTransaction[]; total: number }> {
    return this.transaction.getTransactionHistory(userId, limit, offset);
  }

  async getTransactionById(transactionId: string): Promise<CreditTransaction | null> {
    return this.transaction.getTransactionById(transactionId);
  }

  async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'completed' | 'failed' | 'refunded'
  ): Promise<void> {
    return this.transaction.updateTransactionStatus(transactionId, status);
  }

  async fulfillOrder(input: FulfillOrderInput): Promise<{ orderId: string; transactionId: string }> {
    return this.order.fulfillOrder(input);
  }

  async createPendingOrder(input: CreatePendingOrderInput): Promise<{ orderId: string }> {
    return this.order.createPendingOrder(input);
  }

  async updatePendingOrderTransaction(orderId: string, transactionId: string): Promise<{ updated: boolean }> {
    return this.order.updatePendingOrderTransaction(orderId, transactionId);
  }

  async updatePendingOrderStatus(
    orderId: string,
    status: string,
    errorMessage?: string
  ): Promise<{ updated: boolean }> {
    return this.order.updatePendingOrderStatus(orderId, status, errorMessage);
  }

  async getOrders(userId: string, limit?: number, offset?: number) {
    return this.order.getOrders(userId, limit, offset);
  }

  async grantRevenueCatCredits(input: {
    userId: string;
    productId: string;
    transactionId: string;
    creditsAmount: number;
  }) {
    return this.order.grantRevenueCatCredits(input);
  }

  async createGift(input: CreateGiftInput): Promise<{ giftId: string }> {
    return this.gift.createGift(input);
  }

  async claimGift(claimToken: string, recipientId: string): Promise<{ creditsAmount: number } | null> {
    return this.gift.claimGift(claimToken, recipientId);
  }

  async getSentGifts(userId: string) {
    return this.gift.getSentGifts(userId);
  }

  async getReceivedGifts(userId: string) {
    return this.gift.getReceivedGifts(userId);
  }

  async getPendingGiftsForUser(userId: string) {
    return this.gift.getPendingGiftsForUser(userId);
  }
}
