/**
 * Génère les icônes de l'app (assets/images/*.png) à partir des sources SVG de
 * la marque (assets/branding/*.svg), avec Chrome / Chromium en mode headless
 * (fond transparent conservé).
 *
 *   node scripts/generer-icones.mjs
 *   CHROME=/chemin/vers/chrome node scripts/generer-icones.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '..');
const sources = join(racine, 'assets/branding');
const sorties = join(racine, 'assets/images');

/** source SVG → fichier PNG, taille en pixels */
const ICONES = [
  ['icone.svg', 'icon.png', 1024],
  ['demarrage.svg', 'splash-icon.png', 1024],
  ['android-avant-plan.svg', 'android-icon-foreground.png', 512],
  ['android-fond.svg', 'android-icon-background.png', 512],
  ['android-monochrome.svg', 'android-icon-monochrome.png', 512],
  ['favicon.svg', 'favicon.png', 48],
];

const chrome =
  process.env.CHROME ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((c) => existsSync(c));

if (!chrome) {
  console.error('Chrome introuvable : définissez la variable CHROME.');
  process.exit(1);
}

const temporaire = mkdtempSync(join(tmpdir(), 'icones-'));
try {
  for (const [source, sortie, taille] of ICONES) {
    const svg = readFileSync(join(sources, source), 'utf8');
    const page = join(temporaire, `${sortie}.html`);
    writeFileSync(
      page,
      `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block;width:${taille}px;height:${taille}px}</style></head>` +
        `<body><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`,
    );
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${taille},${taille}`,
      `--screenshot=${join(sorties, sortie)}`,
      `file://${page}`,
    ], { stdio: 'ignore' });
    console.log(`✓ ${sortie} (${taille}×${taille})`);
  }
} finally {
  rmSync(temporaire, { recursive: true, force: true });
}
