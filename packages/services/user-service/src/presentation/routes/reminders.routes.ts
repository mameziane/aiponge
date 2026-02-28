import { Router } from 'express';
import type { NarrativeSeedsController } from '../controllers/NarrativeSeedsController';
import type { BookReminderController } from '../controllers/BookReminderController';
import type { ReminderController } from '../controllers/ReminderController';

interface ReminderRouteDeps {
  narrativeSeedsController: NarrativeSeedsController;
  bookReminderController: BookReminderController;
  reminderController: ReminderController;
}

export function registerReminderRoutes(router: Router, deps: ReminderRouteDeps): void {
  const { narrativeSeedsController, bookReminderController, reminderController } = deps;

  // ==============================================
  // NARRATIVE SEEDS ROUTES (for music-service)
  // ==============================================

  router.get('/narrative-seeds/:userId', (req, res) => narrativeSeedsController.getNarrativeSeeds(req, res));

  // ==============================================
  // BOOK REMINDERS ROUTES (6 endpoints)
  // Reminders for personal books
  // ==============================================

  router.get('/reminders/book', (req, res) => bookReminderController.getReminders(req, res));
  router.post('/reminders/book', (req, res) => bookReminderController.createReminder(req, res));
  router.patch('/reminders/book/:id', (req, res) => bookReminderController.updateReminder(req, res));
  router.delete('/reminders/book/:id', (req, res) => bookReminderController.deleteReminder(req, res));

  // Scheduler endpoints (internal service-to-service)
  router.get('/reminders/book/enabled', (req, res) => bookReminderController.getEnabledReminders(req, res));
  router.get('/reminders/book/due', (req, res) => bookReminderController.getDueReminders(req, res));
  router.post('/reminders/book/:id/triggered', (req, res) => bookReminderController.updateReminderTriggered(req, res));

  // Push notification token management
  router.post('/push-tokens', (req, res) => bookReminderController.registerPushToken(req, res));
  router.delete('/push-tokens', (req, res) => bookReminderController.deactivatePushToken(req, res));
  router.get('/push-tokens/user/:userId', (req, res) => bookReminderController.getPushTokensByUser(req, res));

  // ==============================================
  // GENERIC REMINDERS ROUTES (5 endpoints)
  // Unified API for all reminder types: book, reading, listening, meditation
  // ==============================================

  router.get('/reminders', (req, res) => reminderController.getReminders(req, res));
  router.get('/reminders/types', (req, res) => reminderController.getReminderTypes(req, res));
  router.post('/reminders', (req, res) => reminderController.createReminder(req, res));
  router.patch('/reminders/:id', (req, res) => reminderController.updateReminder(req, res));
  router.delete('/reminders/:id', (req, res) => reminderController.deleteReminder(req, res));
}
