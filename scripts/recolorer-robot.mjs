/**
 * Recolore l'animation Lottie du robot assistant aux couleurs de BorneApp :
 * yeux cyan → rouge de la marque, visière bleu-vert → encre teintée bordeaux.
 * Le corps gris clair est conservé (lisible sur fond sombre).
 *
 *   node scripts/recolorer-robot.mjs <source.json> [assets/animations/assistant-robot.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [source, sortie = 'assets/animations/assistant-robot.json'] = process.argv.slice(2);
if (!source) {
  console.error('Usage : node scripts/recolorer-robot.mjs <source.json> [sortie.json]');
  process.exit(1);
}

const hex = (h) => [1, 3, 5].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1000) / 1000);

/** Couleur d'origine (hex) → couleur BorneApp (hex). */
const PALETTE = {
  // Yeux
  '#95F5FF': '#FFC2CA',
  '#75EAF7': '#FF7A8C',
  '#53DFEE': '#F04257',
  '#54E0EF': '#F04257',
  // Visière
  '#1F465F': '#3A1A22',
  '#163345': '#24121A',
  '#0E1F2B': '#0D0D10',
};

/** Remplacement à ±2/255 près : les fichiers Lottie stockent des flottants arrondis. */
const remplacer = (r, g, b) => {
  for (const [origine, cible] of Object.entries(PALETTE)) {
    const [R, G, B] = hex(origine);
    if (Math.abs(R - r) <= 0.008 && Math.abs(G - g) <= 0.008 && Math.abs(B - b) <= 0.008) return hex(cible);
  }
  return null;
};

let changements = 0;
function parcourir(noeud) {
  if (Array.isArray(noeud)) return noeud.forEach(parcourir);
  if (!noeud || typeof noeud !== 'object') return;

  // Remplissage / contour uni : c.k = [r, g, b, a]
  if ((noeud.ty === 'fl' || noeud.ty === 'st') && Array.isArray(noeud.c?.k) && typeof noeud.c.k[0] === 'number') {
    const n = remplacer(...noeud.c.k.slice(0, 3));
    if (n) {
      noeud.c.k.splice(0, 3, ...n);
      changements++;
    }
  }
  // Dégradé : g.k.k = [pos, r, g, b, pos, r, g, b, …, (opacités)]
  if ((noeud.ty === 'gf' || noeud.ty === 'gs') && Array.isArray(noeud.g?.k?.k) && typeof noeud.g.k.k[0] === 'number') {
    const k = noeud.g.k.k;
    for (let i = 0; i < noeud.g.p * 4; i += 4) {
      const n = remplacer(k[i + 1], k[i + 2], k[i + 3]);
      if (n) {
        k.splice(i + 1, 3, ...n);
        changements++;
      }
    }
  }
  Object.values(noeud).forEach(parcourir);
}

const animation = JSON.parse(readFileSync(source, 'utf8'));
parcourir(animation.layers);
animation.nm = 'Assistant BorneApp';
writeFileSync(sortie, JSON.stringify(animation));
console.log(`✓ ${changements} couleurs remplacées → ${sortie}`);
