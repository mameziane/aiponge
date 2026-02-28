import { Router, Request, Response } from 'express';
import type { OnboardingController } from '../controllers/OnboardingController';
import type { AnalyticsController } from '../controllers/AnalyticsController';

interface OnboardingAnalyticsRouteDeps {
  onboardingController: OnboardingController;
  analyticsController: AnalyticsController;
}

export function registerOnboardingAnalyticsRoutes(router: Router, deps: OnboardingAnalyticsRouteDeps): void {
  const { onboardingController, analyticsController } = deps;

  // Onboarding routes
  router.get('/onboarding/status', (req, res) => onboardingController.getOnboardingStatus(req, res));
  router.post('/onboarding/initialize', (req, res) => onboardingController.initializeUser(req, res));
  router.post('/onboarding/complete', (req, res) => onboardingController.completeOnboarding(req, res));

  // Analytics routes
  router.post('/analytics/users/:userId/analytics', (req, res) => analyticsController.generateUserAnalytics(req, res));
  router.get('/analytics/users/:userId/personality', (req, res) => analyticsController.getPersonalityProfile(req, res));
  router.get('/analytics/profiles/:userId/highlights', (req, res) =>
    analyticsController.getProfileHighlights(req, res)
  );
  router.get('/analytics/users/:userId/persona', (req, res) => analyticsController.getUserPersona(req, res));
  router.get('/analytics/users/:userId/wellness', (req, res) => analyticsController.getUserWellness(req, res));

  // Persona endpoints (for music-service and other consumers)
  router.get('/persona/:userId/latest', (req, res) => analyticsController.getLatestPersona(req, res));
  router.post('/persona/:userId/refresh', (req, res) => analyticsController.refreshPersona(req, res));
  router.get('/analytics/content', (req, res) => analyticsController.getContentAnalytics(req, res));
  router.post('/analytics/content/track', (req, res) => analyticsController.trackContentView(req, res));
}
