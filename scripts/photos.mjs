// Récupère une photo libre de droits par recette (Wikimedia Commons), la
// télécharge en 640 px dans img/ et écrit photos.js (fichier, auteur, licence).
//
//   node scripts/photos.mjs                 → seulement les recettes sans photo ou dont la règle a changé
//   node scripts/photos.mjs --forcer a,b    → refait ces recettes
//
// Règle par recette (SPECS) :
//   'w:Titre'     article de Wikipédia FR (titre exact, sinon recherche) → son image principale
//   'c:mots clés' recherche de fichiers sur Commons → première photo paysage assez grande
//   'f:Nom.jpg'   fichier Commons précis (pour corriger un mauvais choix à la main)
import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const RACINE = path.join(import.meta.dirname, '..');
const DOSSIER = path.join(RACINE, 'img');
const SORTIE = path.join(RACINE, 'photos.js');
const ENTETES = { 'User-Agent': 'recettes-proteinees/1.0 (site perso de recettes ; script photos.mjs)' };
const LARGEUR = 640;

export const SPECS = {
  'shakshuka': 'w:Chakchouka',
  'tortilla-espagnole': 'w:Tortilla de patatas',
  'riz-cantonais': 'w:Riz cantonais',
  'omelette-mug': 'w:Omelette',
  'frittata-potimarron': 'w:Frittata',
  'oeufs-brouilles-poireaux': 'w:Œufs brouillés',
  'oeufs-mimosa-thon': 'w:Œuf mimosa',
  'dahl-lentilles-corail': 'f:Dal Tadka-Delhi.jpg',
  'soupe-lentilles-lardons': 'c:lentil soup',
  'veloute-potimarron-lentilles': 'c:pumpkin soup',
  'curry-lentilles-potimarron': 'c:pumpkin curry',
  'bolognaise-lentilles': 'f:Spaghetti Bolognese Lokal K.jpg',
  'salade-lentilles-oeuf-mollet': 'c:lentil salad',
  'soupe-lentilles-carottes-cumin': 'c:red lentil soup',
  'curry-poulet-coco': 'c:chicken curry coconut',
  'poulet-poireaux-moutarde': 'c:chicken cream sauce',
  'poulet-basquaise': 'w:Poulet basquaise',
  'wok-poulet-poireaux-carottes': 'f:Chicken Chow Mein (2411270286).jpg',
  'poulet-teriyaki': 'w:Teriyaki',
  'risotto-poulet-champignons': 'c:chicken mushroom risotto',
  'poulet-potimarron-poele': 'c:chicken squash',
  'fajitas-poulet': 'w:Fajitas',
  'salade-cesar-poulet': 'w:Salade César',
  'poulet-tikka-masala': 'w:Poulet tikka massala',
  'pates-poireaux-lardons': 'c:pasta leek',
  'carbonara': 'w:Spaghetti alla carbonara',
  'tartiflette-poele': 'w:Tartiflette',
  'rillettes-sardines': 'c:sardines toast',
  'spaghetti-sardines-poireaux': 'w:Pasta con le sarde',
  'salade-pdt-sardines': 'f:Grilled Sardines in-the-Charcoal with salad 7.50€ (3784714323).jpg',
  'galettes-thon': 'f:Fishcake on salad.jpg',
  'poke-bowl-thon': 'w:Poke (cuisine)',
  'pdt-farcie-thon': 'c:baked potato tuna',
  'pates-thon-tomate': 'f:Pasta with Tuna (4690354038).jpg',
  'salade-pois-chiches-thon': 'f:Colorful healthy Chickpea Salad - 49859083608.jpg',
  'wraps-thon': 'c:tuna wrap',
  'chili-con-carne': 'w:Chili con carne',
  'boeuf-bourguignon': 'w:Bœuf bourguignon',
  'pot-au-feu': 'w:Pot-au-feu',
  'carbonade-flamande': 'w:Carbonade flamande',
  'boulettes-sauce-tomate': 'c:meatballs tomato sauce',
  'blanquette-poulet': 'w:Blanquette de veau',
  'coq-au-vin': 'w:Coq au vin',
  'poulet-chasseur': 'w:Poulet chasseur',
  'poule-au-pot': 'w:Poule au pot',
  'lentilles-saucisses-fumees': 'c:saucisse lentilles',
  'potee-auvergnate': 'w:Potée auvergnate',
  'porc-cidre-pommes': 'f:Brasserie des Terreaux (Belley) - sauté de porc et ses légumes.jpg',
  'soupe-pois-casses-lard': 'c:split pea soup',
  'garbure': 'w:Garbure',
  'minestrone': 'w:Minestrone',
  'steak-au-poivre': 'w:Steak au poivre',
  'oeufs-meurette': 'w:Œufs en meurette',
  'choucroute-garnie': 'w:Choucroute garnie',
  'cassoulet-express': 'w:Cassoulet',
  'salade-nicoise': 'w:Salade niçoise',
  'salade-lyonnaise': 'w:Salade lyonnaise',
  'croque-madame': 'w:Croque-madame',
  'galette-complete': 'w:Galette de sarrasin',
  'tomates-farcies': 'w:Tomates farcies',
  'boeuf-carottes': 'f:Beef stew at restaurant Frans & Sandra.jpg',
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(hote, params) {
  const url = `https://${hote}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let essai = 0; essai < 4; essai++) {
    await pause(1500);
    const r = await fetch(url, { headers: ENTETES });
    if (r.status === 429) { await pause(15000 * (essai + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} sur ${url}`);
    return r.json();
  }
  throw new Error(`429 répétés sur ${url}`);
}

// Image principale d'un article Wikipédia FR (titre exact, sinon 3 premiers résultats de recherche).
async function imageArticle(titre) {
  const exact = await api('fr.wikipedia.org', { action: 'query', titles: titre, redirects: '1', prop: 'pageimages', piprop: 'name' });
  const p = exact.query.pages[0];
  if (p && p.pageimage) return p.pageimage;
  const rech = await api('fr.wikipedia.org', { action: 'query', generator: 'search', gsrsearch: titre, gsrlimit: '3', prop: 'pageimages', piprop: 'name' });
  const pages = (rech.query?.pages || []).sort((a, b) => a.index - b.index);
  return pages.find((x) => x.pageimage)?.pageimage || null;
}

// Première photo (pas un dessin) assez grande et en paysage parmi les résultats Commons.
async function imageCommons(mots) {
  const r = await api('commons.wikimedia.org', {
    action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: `${mots} filetype:bitmap`, gsrlimit: '15',
    prop: 'imageinfo', iiprop: 'size|mime',
  });
  const pages = (r.query?.pages || []).sort((a, b) => a.index - b.index);
  const ok = pages.find(({ imageinfo: [i] = [] }) => i && i.mime === 'image/jpeg' && i.width >= 800 && i.width / i.height >= 1.1 && i.width / i.height <= 2.2);
  return ok ? ok.title.replace(/^File:/, '') : null;
}

const sansHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '’').replace(/\s+/g, ' ').trim();
// Crédit lisible : sans adresse e-mail (ni ce qui la suit), ni horodatage de signature wiki.
const nettoyerAuteur = (s) => s.split(' - ')[0].replace(/\s*\S+\s*(@|\[at\])\s*\S+.*$/i, '').replace(/\s*\d{1,2}:\d{2}, \d{1,2} \w+ \d{4} \(UTC\)/g, '').trim().slice(0, 80);

async function infos(fichier) {
  const r = await api('commons.wikimedia.org', {
    action: 'query', titles: `File:${fichier}`, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: String(LARGEUR),
    iiextmetadatafilter: 'Artist|LicenseShortName', iiextmetadatalanguage: 'fr',
  });
  const i = r.query.pages[0].imageinfo?.[0];
  if (!i) throw new Error(`fichier introuvable sur Commons : ${fichier}`);
  return {
    url: i.thumburl, w: i.thumbwidth, h: i.thumbheight, page: i.descriptionurl,
    auteur: nettoyerAuteur(sansHtml(i.extmetadata?.Artist?.value)) || 'auteur inconnu',
    licence: sansHtml(i.extmetadata?.LicenseShortName?.value) || 'licence non précisée',
  };
}

function lireExistant() {
  if (!existsSync(SORTIE)) return {};
  // Non gourmand : s'arrêter au premier « } » en début de ligne (fin du JSON), pas à celui de module.exports.
  const m = readFileSync(SORTIE, 'utf8').match(/const PHOTOS = (\{[\s\S]*?\n\});/);
  return m ? JSON.parse(m[1]) : {};
}

async function main() {
  const forcer = new Set((process.argv.find((a, i) => process.argv[i - 1] === '--forcer') || '').split(',').filter(Boolean));
  mkdirSync(DOSSIER, { recursive: true });
  const photos = lireExistant();
  const echecs = [];
  for (const [id, spec] of Object.entries(SPECS)) {
    const deja = photos[id];
    if (deja && deja.spec === spec && !forcer.has(id) && existsSync(path.join(RACINE, deja.src))) continue;
    try {
      const [type, valeur] = [spec.slice(0, 1), spec.slice(2)];
      const fichier = type === 'f' ? valeur : type === 'w' ? await imageArticle(valeur) : await imageCommons(valeur);
      if (!fichier) throw new Error('aucune image trouvée');
      const i = await infos(fichier);
      const ext = path.extname(new URL(i.url).pathname).toLowerCase() || '.jpg';
      const src = `img/${id}${ext}`;
      await pause(400);
      const rep = await fetch(i.url, { headers: ENTETES });
      if (!rep.ok) throw new Error(`téléchargement ${rep.status}`);
      if (deja && deja.src !== src && existsSync(path.join(RACINE, deja.src))) unlinkSync(path.join(RACINE, deja.src));
      writeFileSync(path.join(RACINE, src), Buffer.from(await rep.arrayBuffer()));
      photos[id] = { src, w: i.w, h: i.h, auteur: i.auteur, licence: i.licence, page: i.page, fichier, spec };
      console.log(`✓ ${id} ← ${fichier} (${i.licence})`);
    } catch (e) {
      echecs.push(id);
      console.log(`✗ ${id} (${spec}) : ${e.message}`);
    }
  }
  writeFileSync(SORTIE, `// Généré par scripts/photos.mjs : ne pas modifier à la main.\n// Photos de Wikimedia Commons, crédit et licence affichés sur chaque fiche.\nconst PHOTOS = ${JSON.stringify(photos, null, 1)};\n\nif (typeof module === 'object') module.exports = { PHOTOS };\n`);
  console.log(`${Object.keys(photos).length} photos dans photos.js, ${echecs.length} échec(s)${echecs.length ? ' : ' + echecs.join(', ') : ''}`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
