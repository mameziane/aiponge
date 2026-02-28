import type { Request, Response } from 'express';
import type express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GatewayAppContext } from './context';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function setupStaticRoutes(app: express.Application, ctx: GatewayAppContext): void {
  app.get('/', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  const packageRoot = path.resolve(__dirname, '../..');
  const publicDir = path.join(packageRoot, 'public');

  app.get('/privacy', (req: Request, res: Response) => {
    const filePath = path.join(publicDir, 'privacy.html');
    res.sendFile(filePath, err => {
      if (err) {
        ctx.logger.error('Failed to serve privacy policy', { error: err.message, path: filePath });
        res.status(404).send('Privacy policy not found');
      }
    });
  });

  app.get('/terms', (req: Request, res: Response) => {
    const filePath = path.join(publicDir, 'terms.html');
    res.sendFile(filePath, err => {
      if (err) {
        ctx.logger.error('Failed to serve terms of service', { error: err.message, path: filePath });
        res.status(404).send('Terms of service not found');
      }
    });
  });
}
