// Genera los juegos en un solo archivo cada uno:
//   dist/spiderman.html   (versión 2.5D)
//   dist/spiderman3d.html (versión 3D, incluye Three.js)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'dist'), { recursive: true });

function bundle(htmlPath, links) {
  const base = dirname(htmlPath);
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/<script src="([\w./-]+\.js)"><\/script>/g, (m, src) => {
    let code = readFileSync(join(base, src), 'utf8');
    for (const [a, b] of links) code = code.split(a).join(b);
    return '<script>\n// ---- ' + src + ' ----\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  });
  return html;
}
const out = [
  ['index.html', 'spiderman.html', [["'3d/index.html'", "'spiderman3d.html'"]]],
  ['3d/index.html', 'spiderman3d.html', [["'../index.html'", "'spiderman.html'"]]],
];
for (const [src, dst, links] of out) {
  const html = bundle(join(root, src), links);
  writeFileSync(join(root, 'dist', dst), html);
  console.log('dist/' + dst, (html.length / 1024).toFixed(1) + ' KB');
}
