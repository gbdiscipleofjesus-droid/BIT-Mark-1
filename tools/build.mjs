// Genera dist/spiderman.html: todo el juego en un solo archivo
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="(js\/[\w.]+)"><\/script>/g, (m, src) => {
  const code = readFileSync(join(root, src), 'utf8');
  return '<script>\n// ---- ' + src + ' ----\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'spiderman.html'), html);
console.log('dist/spiderman.html', (html.length / 1024).toFixed(1) + ' KB');
