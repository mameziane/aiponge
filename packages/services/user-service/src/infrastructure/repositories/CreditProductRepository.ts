/**
 * Credit Product Repository
 * Database-driven credit pack pricing and configuration
 * Replaces hardcoded CREDIT_PRODUCTS in API gateway
 */

import { eq, and, asc } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { usrCreditProducts, CreditProduct, InsertCreditProduct } from '../database/schemas/subscription-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('credit-product-repository');

export interface CreditProductCatalog {
  creditPacks: CreditProduct[];
  premiumSessions: CreditProduct[];
  giftCredits: CreditProduct[];
  paymentMethod: string;
}

export class CreditProductRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getActiveProducts(): Promise<CreditProduct[]> {
    const products = await this.db
      .select()
      .from(usrCreditProducts)
      .where(eq(usrCreditProducts.isActive, true))
      .orderBy(asc(usrCreditProducts.sortOrder));

    return products;
  }

  async getProductsByType(productType: string): Promise<CreditProduct[]> {
    const products = await this.db
      .select()
      .from(usrCreditProducts)
      .where(and(eq(usrCreditProducts.productType, productType), eq(usrCreditProducts.isActive, true)))
      .orderBy(asc(usrCreditProducts.sortOrder));

    return products;
  }

  async getProductCatalog(): Promise<CreditProductCatalog> {
    const allProducts = await this.getActiveProducts();

    const creditPacks = allProducts.filter(p => p.productType === 'pack');
    const premiumSessions = allProducts.filter(p => p.productType === 'premium_session');
    const giftCredits = allProducts.filter(p => p.productType === 'gift');

    return {
      creditPacks,
      premiumSessions,
      giftCredits,
      paymentMethod: 'in_app_purchase',
    };
  }

  async getProductById(productId: string): Promise<CreditProduct | null> {
    const [product] = await this.db.select().from(usrCreditProducts).where(eq(usrCreditProducts.productId, productId));

    return product || null;
  }

  async upsertProduct(product: InsertCreditProduct): Promise<CreditProduct> {
    const insertValues = {
      productId: product.productId,
      productType: product.productType,
      name: product.name,
      description: product.description ?? null,
      credits: Number(product.credits ?? 0),
      priceUsd: Number(product.priceUsd),
      isActive: Boolean(product.isActive ?? true),
      isPopular: Boolean(product.isPopular ?? false),
      sortOrder: Number(product.sortOrder ?? 0),
      metadata: product.metadata ?? {},
    };

    const [result] = await this.db
      .insert(usrCreditProducts)
      .values(insertValues)
      .onConflictDoUpdate({
        target: usrCreditProducts.productId,
        set: {
          name: insertValues.name,
          description: insertValues.description,
          credits: insertValues.credits,
          priceUsd: insertValues.priceUsd,
          isActive: insertValues.isActive,
          isPopular: insertValues.isPopular,
          sortOrder: insertValues.sortOrder,
          metadata: insertValues.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info('Credit product upserted', { productId: product.productId, name: product.name });
    return result;
  }

  async seedDefaultProducts(): Promise<void> {
    const defaultProducts: InsertCreditProduct[] = [
      {
        productId: 'credit_pack_starter',
        productType: 'pack',
        name: 'Song Pack',
        description: 'Get started with 50 credits',
        credits: 50,
        priceUsd: 499,
        isActive: true,
        isPopular: false,
        sortOrder: 1,
      },
      {
        productId: 'credit_pack_plus',
        productType: 'pack',
        name: 'Plus Pack',
        description: 'Best value - 150 credits',
        credits: 150,
        priceUsd: 1199,
        isActive: true,
        isPopular: true,
        sortOrder: 2,
      },
      {
        productId: 'credit_pack_pro',
        productType: 'pack',
        name: 'Pro Pack',
        description: 'Power user pack - 400 credits',
        credits: 400,
        priceUsd: 2499,
        isActive: true,
        isPopular: false,
        sortOrder: 3,
      },
      {
        productId: 'deep_resonance_single',
        productType: 'premium_session',
        name: 'Deep Resonance Session',
        description: 'One AI music session',
        credits: 0,
        priceUsd: 999,
        isActive: true,
        isPopular: false,
        sortOrder: 1,
      },
      {
        productId: 'deep_resonance_3pack',
        productType: 'premium_session',
        name: 'Deep Resonance 3-Pack',
        description: 'Three AI sessions at 17% off',
        credits: 0,
        priceUsd: 2499,
        isActive: true,
        isPopular: false,
        sortOrder: 2,
      },
      {
        productId: 'gift_credits_25',
        productType: 'gift',
        name: 'Gift 25 Credits',
        description: 'Send credits to a friend',
        credits: 25,
        priceUsd: 299,
        isActive: true,
        isPopular: false,
        sortOrder: 1,
      },
      {
        productId: 'gift_credits_50',
        productType: 'gift',
        name: 'Gift 50 Credits',
        description: 'Send credits to a friend',
        credits: 50,
        priceUsd: 499,
        isActive: true,
        isPopular: false,
        sortOrder: 2,
      },
      {
        productId: 'gift_credits_100',
        productType: 'gift',
        name: 'Gift 100 Credits',
        description: 'Send credits to a friend',
        credits: 100,
        priceUsd: 899,
        isActive: true,
        isPopular: false,
        sortOrder: 3,
      },
    ];

    for (const product of defaultProducts) {
      await this.upsertProduct(product);
    }

    logger.info('Default credit products seeded', { count: defaultProducts.length });
  }
}
