export {
  registerShutdownHook,
  registerPhasedShutdownHook,
  setupGracefulShutdown,
  isShutdownInProgress,
  type ShutdownPhase,
} from './gracefulShutdown.js';
