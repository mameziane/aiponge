import { Router, Request, Response } from 'express';
import type { AuthController } from '../controllers/AuthController';
import type { GuestConversionController } from '../controllers/GuestConversionController';

interface AuthRouteDeps {
  authController: AuthController;
  guestConversionController: GuestConversionController;
}

export function registerAuthRoutes(router: Router, deps: AuthRouteDeps): void {
  const { authController, guestConversionController } = deps;

  // Basic authentication
  router.post('/auth/register', (req, res) => authController.register(req, res));
  router.post('/auth/login', (req, res) => authController.login(req, res));
  router.post('/auth/guest', (req, res) => authController.guestAuth(req, res));
  router.post('/auth/refresh', (req, res) => authController.refreshToken(req, res));
  router.post('/auth/authenticate', (req, res) => authController.authenticate(req, res));
  router.get('/auth/me', (req, res) => authController.getCurrentUser(req, res));
  router.post('/auth/logout', (req, res) => authController.logout(req, res));
  router.post('/auth/logout-all', (req, res) => authController.logoutAllSessions(req, res));

  // Full user registration (creates profile with additional fields)
  router.post('/auth/register/full', (req, res) => authController.registerUser(req, res));

  // SMS verification
  router.post('/auth/sms/send-code', (req, res) => authController.sendSmsVerificationCode(req, res));
  router.post('/auth/sms/verify-code', (req, res) => authController.verifySmsCode(req, res));

  // Password management (token-based)
  router.post('/auth/password/request-reset', (req, res) => authController.requestPasswordReset(req, res));
  router.post('/auth/password/reset', (req, res) => authController.resetPassword(req, res));

  // Password management (code-based for mobile)
  router.post('/auth/password/request-code', (req, res) => authController.requestPasswordResetCode(req, res));
  router.post('/auth/password/verify-code', (req, res) => authController.verifyPasswordResetCode(req, res));
  router.post('/auth/password/reset-with-token', (req, res) => authController.resetPasswordWithToken(req, res));

  // Account deletion
  router.delete('/auth/delete-account', (req, res) => authController.deleteAccount(req, res));

  // Guest conversion routes
  router.get('/guest-conversion/policy', (req, res) => guestConversionController.getPolicy(req, res));
  router.get('/guest-conversion/:userId/state', (req, res) => guestConversionController.getState(req, res));
  router.post('/guest-conversion/:userId/event', (req, res) => guestConversionController.trackEvent(req, res));
  router.post('/guest-conversion/:userId/convert', (req, res) => guestConversionController.markConverted(req, res));
}
