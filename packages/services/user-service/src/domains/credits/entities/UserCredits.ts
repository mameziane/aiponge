/**
 * User Credits Entity
 * Represents a user's credit balance
 */

export interface UserCredits {
  userId: string;
  startingBalance: number;
  currentBalance: number;
  totalSpent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditBalance {
  userId: string;
  currentBalance: number;
  totalSpent: number;
  remaining: number;
}
