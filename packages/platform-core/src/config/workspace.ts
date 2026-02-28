import fs from 'fs';
import path from 'path';

let cachedRoot: string | null = null;

export function findWorkspaceRoot(startDir?: string): string {
  if (cachedRoot) return cachedRoot;

  let dir = startDir || process.cwd();

  while (dir !== path.dirname(dir)) {
    const turboPath = path.join(dir, 'turbo.json');
    if (fs.existsSync(turboPath)) {
      cachedRoot = dir;
      return dir;
    }
    dir = path.dirname(dir);
  }

  cachedRoot = process.cwd();
  return cachedRoot;
}

export function getUploadsPath(): string {
  return path.join(findWorkspaceRoot(), 'uploads');
}
