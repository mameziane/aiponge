import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getEntryPoints(dir) {
  const entries = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = resolve(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      const indexPath = resolve(fullPath, 'index.ts');
      try {
        statSync(indexPath);
        entries.push(indexPath);
      } catch {}
    } else if (item === 'index.ts' || item === 'types.ts') {
      entries.push(fullPath);
    }
  }
  
  return entries;
}

const srcDir = resolve(__dirname, 'src');
const entryPoints = getEntryPoints(srcDir);

await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: resolve(__dirname, 'dist'),
  sourcemap: true,
  minify: true,
  packages: 'external',
  splitting: true,
  outExtension: { '.js': '.js' },
});

console.log('✅ Platform-core bundled successfully');
