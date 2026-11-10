// Génère les icônes PNG de l'application (assiette blanche sur fond orange) dans icons/.
//   node scripts/icones.mjs
// Aucune dépendance : rastérisation à la main + PNG écrit avec zlib.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sortie = path.join(import.meta.dirname, '..', 'icons');
mkdirSync(sortie, { recursive: true });

const FOND = [0xc9, 0x54, 0x1f];
const BLANC = [255, 255, 255];
const CREUX = [0xf6, 0xe7, 0xdc];

// Couleur d'un point (coordonnées en fraction du côté) : fond, bord de l'assiette, creux de l'assiette.
function couleur(x, y, echelle) {
  const d = Math.hypot(x - 0.5, y - 0.5) / echelle;
  if (d <= 0.25) return CREUX;
  if (d <= 0.36) return BLANC;
  return FOND;
}

// Carré à coins arrondis (rayon en fraction du côté) ; rayon 0 = plein cadre (icône « maskable »).
function dansCoins(x, y, rayon) {
  const cx = Math.min(Math.max(x, rayon), 1 - rayon);
  const cy = Math.min(Math.max(y, rayon), 1 - rayon);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rayon * rayon;
}

function dessiner(taille, { rayon, echelle }) {
  const SS = 3; // sur-échantillonnage pour des bords lisses
  const brut = Buffer.alloc((taille * 4 + 1) * taille);
  for (let y = 0; y < taille; y++) {
    const ligne = y * (taille * 4 + 1);
    for (let x = 0; x < taille; x++) {
      const somme = [0, 0, 0];
      let dedans = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / taille;
          const py = (y + (sy + 0.5) / SS) / taille;
          if (!dansCoins(px, py, rayon)) continue;
          dedans++;
          const c = couleur(px, py, echelle);
          for (let k = 0; k < 3; k++) somme[k] += c[k];
        }
      }
      const o = ligne + 1 + x * 4;
      for (let k = 0; k < 3; k++) brut[o + k] = dedans ? Math.round(somme[k] / dedans) : 0;
      brut[o + 3] = Math.round((255 * dedans) / (SS * SS));
    }
  }
  return brut;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function bloc(type, data) {
  const t = Buffer.from(type, 'ascii');
  const longueur = Buffer.alloc(4); longueur.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([longueur, t, data, crc]);
}
function png(taille, opts) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr), bloc('IDAT', deflateSync(dessiner(taille, opts))), bloc('IEND', Buffer.alloc(0)),
  ]);
}

for (const [nom, taille, opts] of [
  ['icon-192.png', 192, { rayon: 0.2, echelle: 1 }],
  ['icon-512.png', 512, { rayon: 0.2, echelle: 1 }],
  ['icon-maskable-512.png', 512, { rayon: 0, echelle: 0.8 }], // zone sûre : l'assiette tient dans le cercle central
  ['apple-touch-icon.png', 180, { rayon: 0, echelle: 1 }],
]) {
  writeFileSync(path.join(sortie, nom), png(taille, opts));
  console.log(nom);
}
