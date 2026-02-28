import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('App Routes (aggregator)', () => {
  const routeFilePath = path.resolve(__dirname, '../../presentation/routes/app.routes.ts');
  const routeFileContent = fs.readFileSync(routeFilePath, 'utf-8');

  it('should export a named router as appRoutes', () => {
    expect(routeFileContent).toContain('export { router as appRoutes }');
    expect(routeFileContent).toContain('const router: Router = Router()');
  });

  it('should import and mount entries sub-router', () => {
    expect(routeFileContent).toContain("import entriesRouter from './app/entries.routes'");
    expect(routeFileContent).toContain("router.use('/entries', entriesRouter)");
  });

  it('should import and mount music sub-router', () => {
    expect(routeFileContent).toContain("import musicRouter from './app/music.routes'");
    expect(routeFileContent).toContain("router.use('/music', musicRouter)");
  });

  it('should import and mount library sub-router', () => {
    expect(routeFileContent).toContain("import libraryRouter from './app/library.routes'");
    expect(routeFileContent).toContain("router.use('/library', libraryRouter)");
  });

  it('should import and mount safety sub-router', () => {
    expect(routeFileContent).toContain("import safetyRouter from './app/safety.routes'");
    expect(routeFileContent).toContain("router.use('/safety', safetyRouter)");
  });

  it('should import and mount profile sub-router', () => {
    expect(routeFileContent).toContain("import profileRouter from './app/profile.routes'");
    expect(routeFileContent).toContain("router.use('/profile', profileRouter)");
  });

  it('should apply JWT auth middleware before member routes', () => {
    expect(routeFileContent).toContain("import { jwtAuthMiddleware } from '../middleware/jwtAuthMiddleware'");
    expect(routeFileContent).toContain('router.use(jwtAuthMiddleware)');
  });

  it('should mount public routes before JWT middleware', () => {
    const jwtLine = routeFileContent.indexOf('router.use(jwtAuthMiddleware)');
    const publicLibraryLine = routeFileContent.indexOf("router.use('/library', libraryPublicRouter)");
    const publicLyricsLine = routeFileContent.indexOf("router.use('/lyrics', lyricsPublicRouter)");

    expect(publicLibraryLine).toBeGreaterThan(-1);
    expect(publicLyricsLine).toBeGreaterThan(-1);
    expect(publicLibraryLine).toBeLessThan(jwtLine);
    expect(publicLyricsLine).toBeLessThan(jwtLine);
  });

  it('should mount all expected domain route modules', () => {
    const expectedMounts = [
      '/entries',
      '/music',
      '/library',
      '/playlists',
      '/credits',
      '/profile',
      '/lyrics',
      '/subscriptions',
      '/reflections',
      '/safety',
      '/reminders',
      '/privacy',
    ];

    for (const mount of expectedMounts) {
      expect(routeFileContent).toContain(`'${mount}'`);
    }
  });
});
