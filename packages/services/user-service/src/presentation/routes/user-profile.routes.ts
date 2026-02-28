import { Router, Request, Response } from 'express';
import type { UserController } from '../controllers/UserController';
import type { ProfileController } from '../controllers/ProfileController';

interface UserProfileRouteDeps {
  userController: UserController;
  profileController: ProfileController;
}

export function registerUserProfileRoutes(router: Router, deps: UserProfileRouteDeps): void {
  const { userController, profileController } = deps;

  // User routes
  router.post('/users', (req, res) => userController.createUser(req, res));
  router.get('/users/:id', (req, res) => userController.getUser(req, res));
  router.patch('/users/:id', (req, res) => userController.updateUser(req, res));
  router.patch('/users/:id/preferences', (req, res) => userController.updateUserPreferences(req, res));
  router.delete('/users/:id', (req, res) => userController.deleteUser(req, res));

  // Profile routes
  router.get('/profiles/:userId', (req, res) => profileController.getProfile(req, res));
  router.patch('/profiles/:userId', (req, res) => profileController.updateProfile(req, res));
  router.get('/profiles/:userId/full', (req, res) => profileController.getFullProfile(req, res));
  router.patch('/profiles/:userId/full', (req, res) => profileController.updateFullProfile(req, res));
  router.get('/profiles/:userId/summary', (req, res) => profileController.getProfileSummary(req, res));
  router.post('/profiles/:userId/export', (req, res) => profileController.exportProfile(req, res));
  router.post('/profiles/import', (req, res) => profileController.importProfile(req, res));
}
