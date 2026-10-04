import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

let esbuild = null;

export async function load(url, context, nextLoad) {
  try {
    if (url.startsWith('file:') && (url.endsWith('.js') || url.endsWith('.jsx'))) {
      const p = fileURLToPath(url);
      if (p.includes('/node_modules/')) return nextLoad(url, context);
      esbuild ??= await import('esbuild');
      const source = await readFile(p, 'utf8');
      if (url.endsWith('.jsx') || /<[A-Za-z/]/.test(source)) {
        const { code } = await esbuild.transform(source, {
          loader: 'jsx',
          format: 'esm',
          jsx: 'automatic',
          sourcefile: p,
        });
        return { format: 'module', source: code, shortCircuit: true };
      }
    }
  } catch (e) {
    console.error('[jsx-loader]', e);
  }
  return nextLoad(url, context);
}
