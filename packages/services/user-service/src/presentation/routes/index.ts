/**
 * Unified API Routes for User Profile Service
 * Uses ServiceFactory for dependency injection (Clean Architecture)
 *
 * Route Naming Convention:
 * - All routes are internal service routes (called by API Gateway)
 * - API Gateway exposes canonical /api/app/* routes to mobile clients
 * - Use plural nouns for collections: /profiles, /entries, /insights
 *
 * Domain Route Modules:
 * - auth.routes.ts: Authentication, registration, guest conversion
 * - user-profile.routes.ts: User CRUD, profile management
 * - intelligence.routes.ts: Entries, chapters, insights, reflections, patterns
 * - onboarding-analytics.routes.ts: Onboarding, analytics, wellness
 * - billing.routes.ts: Credits, subscriptions, quota
 * - library.routes.ts: Unified library, book generation
 * - reminders.routes.ts: Book reminders, generic reminders, push tokens
 * - gdpr.routes.ts: Consent, data export, data deletion
 * - organization.routes.ts: Organizations, creator-member relationships, invitations
 * - admin.routes.ts: Admin metrics, safety, dev-reset, orphan cleanup
 */

import { Router } from 'express';
import { ServiceFactory } from '../../infrastructure/composition/ServiceFactory';
import { UserController } from '../controllers/UserController';
import { OnboardingController } from '../controllers/OnboardingController';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { SubscriptionController } from '../controllers/SubscriptionController';
import { GuestConversionController } from '../controllers/GuestConversionController';
import { BookReminderController } from '../controllers/BookReminderController';
import { ReminderController } from '../controllers/ReminderController';
import { AdminMetricsController } from '../controllers/AdminMetricsController';
import { OrganizationController } from '../controllers/OrganizationController';
import { LibraryController } from '../controllers/library';

import { registerAuthRoutes } from './auth.routes';
import { registerUserProfileRoutes } from './user-profile.routes';
import { registerIntelligenceRoutes } from './intelligence.routes';
import { registerOnboardingAnalyticsRoutes } from './onboarding-analytics.routes';
import { registerBillingRoutes } from './billing.routes';
import { registerLibraryRoutes } from './library.routes';
import { registerReminderRoutes } from './reminders.routes';
import { registerGdprRoutes } from './gdpr.routes';
import { registerOrganizationRoutes } from './organization.routes';
import { registerAdminRoutes } from './admin';
import { registerCompositeRoutes } from './composite.routes';

export function createRoutes(): Router {
  const router = Router();

  const authController = ServiceFactory.createAuthController();
  const userController = ServiceFactory.createUserController();
  const profileController = ServiceFactory.createProfileController();
  const intelligenceController = ServiceFactory.createIntelligenceController();
  const onboardingController = ServiceFactory.createOnboardingController();
  const analyticsController = ServiceFactory.createAnalyticsController();
  const creditController = ServiceFactory.createCreditController();
  const subscriptionController = ServiceFactory.createSubscriptionController();
  const guestConversionController = ServiceFactory.createGuestConversionController();
  const patternController = ServiceFactory.createPatternController();
  const narrativeSeedsController = ServiceFactory.createNarrativeSeedsController();

  const adminMetricsController = new AdminMetricsController();
  const organizationController = new OrganizationController();
  const libraryController = new LibraryController();
  const bookReminderController = new BookReminderController();
  const reminderController = new ReminderController();

  registerAuthRoutes(router, { authController, guestConversionController });
  registerGdprRoutes(router);
  registerUserProfileRoutes(router, { userController, profileController });
  registerIntelligenceRoutes(router, { intelligenceController, patternController });
  registerOnboardingAnalyticsRoutes(router, { onboardingController, analyticsController });
  registerBillingRoutes(router, { creditController, subscriptionController });
  registerLibraryRoutes(router, { libraryController });
  registerOrganizationRoutes(router, { organizationController });
  registerReminderRoutes(router, { narrativeSeedsController, bookReminderController, reminderController });
  registerAdminRoutes(router, { adminMetricsController });
  registerCompositeRoutes(router);

  return router;
}

export default createRoutes();
