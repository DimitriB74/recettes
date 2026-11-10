// Lancer : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { INGR, PRIX, RAYONS, PROTEINES, TYPES, MATERIEL, RECETTES } = require('../donnees.js');
const L = require('../logique.js');

const nutr = Object.fromEntries(RECETTES.map((r) => [r.id, L.nutrition(r, INGR)]));
const couts = Object.fromEntries(RECETTES.map((r) => [r.id, L.cout(r, INGR, PRIX)]));

test('chaque recette est complète et cohérente', () => {
  const ids = new Set();
  for (const r of RECETTES) {
    assert.ok(!ids.has(r.id), `id en double : ${r.id}`);
    ids.add(r.id);
    assert.ok(PROTEINES[r.proteine], `${r.id} : protéine inconnue`);
    assert.ok(TYPES[L.typeDe(r)], `${r.id} : type inconnu`);
    assert.equal(r.moment, undefined, `${r.id} : plus de champ moment (petits-déjeuners retirés)`);
    assert.ok(r.materiel.every((m) => MATERIEL[m]), `${r.id} : matériel inconnu`);
    assert.ok(r.prep > 0 && r.cuisson >= 0 && r.portions > 0, `${r.id} : temps/portions`);
    assert.equal(r.materiel.length === 0, r.cuisson === 0, `${r.id} : sans matériel ⇔ sans cuisson`);
    assert.ok(r.etapes.length >= 3, `${r.id} : étapes`);
    assert.match(r.source.url, /^https:\/\//, `${r.id} : source`);
    for (const [cle] of r.ingr) assert.ok(INGR[cle], `${r.id} : ingrédient inconnu « ${cle} »`);
  }
});

test('chaque recette a sa photo (fichier présent, crédit et licence) et le service worker ne cite que des fichiers existants', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { PHOTOS } = require('../photos.js');
  const racine = path.join(__dirname, '..');
  for (const r of RECETTES) {
    const ph = PHOTOS[r.id];
    assert.ok(ph, `${r.id} : pas de photo`);
    assert.ok(fs.existsSync(path.join(racine, ph.src)), `${r.id} : fichier ${ph.src} absent`);
    assert.ok(ph.auteur && ph.licence && /^https:\/\/commons\.wikimedia\.org\//.test(ph.page), `${r.id} : crédit incomplet`);
  }
  const sw = fs.readFileSync(path.join(racine, 'sw.js'), 'utf8');
  const liste = JSON.parse(sw.match(/const COQUILLE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of liste) if (f !== './') assert.ok(fs.existsSync(path.join(racine, f)), `sw.js : ${f} absent`);
});

test('aucune recette n’utilise de four', () => {
  for (const r of RECETTES) {
    const texte = [...r.etapes, r.astuce || ''].join(' ');
    assert.doesNotMatch(texte, /\b(four|enfourner|gratiner|préchauffer)\b/i, r.id);
  }
});

test('la protéine principale figure bien dans la recette', () => {
  for (const r of RECETTES) {
    const cles = PROTEINES[r.proteine].cles;
    if (cles.length) assert.ok(r.ingr.some(([cle]) => cles.includes(cle)), r.id);
  }
});

test('riche en protéines : au moins 20 g par portion', () => {
  for (const r of RECETTES) assert.ok(nutr[r.id].p >= 20, `${r.id} : ${nutr[r.id].p} g de protéines par portion`);
});

test('chaque ingrédient chiffrable a un prix, coût par portion plausible', () => {
  for (const r of RECETTES) {
    for (const [cle, q] of r.ingr) if (q != null) assert.equal(typeof PRIX[cle], 'number', `${r.id} : pas de prix pour « ${cle} »`);
    assert.ok(couts[r.id] >= 0.5 && couts[r.id] <= 6, `${r.id} : ${couts[r.id]} € par portion`);
  }
  // 2 boîtes de thon (2,50 €) + 100 g de fromage blanc (3,50 €/kg) + 1 c. à s. d’huile (0,12 €), pour 2 portions.
  const r = { portions: 2, ingr: [['thon', 2], ['fromage_blanc', 100], ['huile', 1], ['persil', null], ['feta', 50, '', true]] };
  assert.ok(Math.abs(L.cout(r, INGR, PRIX) - (2 * 2.5 + 0.35 + 0.12) / 2) < 0.006);
  assert.equal(L.euros(2.5), '2,50 €');
});

test('durées longues lisibles et bien rangées', () => {
  assert.equal(L.duree(45), '45 min');
  assert.equal(L.duree(60), '1 h');
  assert.equal(L.duree(230), '3 h 50');
  assert.equal(L.TRANCHES[L.tranche(200)].max, Infinity);
  const mijotes = RECETTES.filter((r) => r.type === 'mijote');
  assert.ok(mijotes.length >= 10 && mijotes.some((r) => L.tempsTotal(r) > 120));
});

test('valeurs nutritionnelles plausibles', () => {
  for (const r of RECETTES) {
    const n = nutr[r.id];
    assert.ok(n.kcal >= 250 && n.kcal <= 800, `${r.id} : ${n.kcal} kcal`);
    // Écart entre l'énergie des macros (4/9/4) et les kcal de la table : < 15 %.
    const e = n.p * 4 + n.l * 9 + n.gl * 4;
    assert.ok(Math.abs(e - n.kcal) / n.kcal < 0.15, `${r.id} : ${e} vs ${n.kcal} kcal`);
  }
});

test('chaque ingrédient a un rayon connu et des valeurs numériques', () => {
  for (const [cle, ing] of Object.entries(INGR)) {
    assert.ok(RAYONS[ing.r], cle);
    for (const k of ['poids', 'p', 'l', 'gl', 'kcal']) assert.equal(typeof ing[k], 'number', `${cle}.${k}`);
  }
});

test('calcul de nutrition sur un cas simple', () => {
  const r = { portions: 2, ingr: [['oeuf', 4], ['sel_poivre', null], ['feta', 100, '', true]] };
  const n = L.nutrition(r, INGR);
  assert.equal(n.p, Math.round((4 * 50 * 12.7) / 100 / 2)); // 13 g, feta facultative ignorée
  assert.equal(n.kcal, 140);
});

test('mise à l’échelle et affichage des quantités', () => {
  const r = RECETTES.find((x) => x.id === 'shakshuka');
  const x3 = L.aLEchelle(r, 3, INGR);
  assert.equal(x3.find((l) => l.cle === 'oeuf').q, 7.5);
  assert.deepEqual(L.libelle('oeuf', 7.5, INGR), { qte: '7 ½', nom: 'œufs' });
  assert.deepEqual(L.libelle('ail', 2, INGR), { qte: '2 gousses', nom: 'ail' });
  assert.deepEqual(L.libelle('pdt', 1250, INGR), { qte: '1,3 kg', nom: 'pommes de terre' });
  assert.equal(L.arrondir(37, 'g'), 35);
  assert.equal(L.arrondir(0.1, 'pièce'), 0.25);
});

test('liste de courses : additionne et arrondit à l’unité supérieure', () => {
  const sel = [{ id: 'shakshuka', portions: 2 }, { id: 'tortilla-espagnole', portions: 1.5 }];
  const { rayons, placard } = L.listeCourses(sel, RECETTES, INGR, RAYONS);
  const tous = rayons.flatMap((r) => r.items);
  assert.equal(tous.find((i) => i.cle === 'oeuf').qte, '9'); // 5 + 8 × 1,5/3 = 9
  assert.equal(tous.find((i) => i.cle === 'oignon').qte, '2'); // 1 + 0,5 → 2
  assert.ok(placard.some((p) => p.cle === 'huile'));
  assert.ok(!tous.some((i) => i.cle === 'huile'));
});

test('filtres et ce que j’ai dans le frigo', () => {
  const ctx = { INGR, PROTEINES, nutr, couts };
  const pasCher = L.filtrer(RECETTES, { coutMax: 2 }, ctx);
  assert.ok(pasCher.length > 0 && pasCher.every((r) => couts[r.id] <= 2));
  assert.ok(L.filtrer(RECETTES, { type: 'soupe' }, ctx).every((r) => r.type === 'soupe'));
  const micro = L.filtrer(RECETTES, { materiel: 'micro' }, ctx);
  assert.ok(micro.length > 0 && micro.every((r) => r.materiel.every((m) => m === 'micro-ondes')));
  const lardons = L.filtrer(RECETTES, { proteine: 'lardons' }, ctx).map((r) => r.id);
  assert.ok(lardons.includes('soupe-lentilles-lardons')); // contient des lardons sans être sa protéine principale
  assert.deepEqual(L.filtrer(RECETTES, { texte: 'OEUF mimosa' }, ctx).map((r) => r.id), ['oeufs-mimosa-thon']);
  const omelette = RECETTES.find((r) => r.id === 'omelette-mug');
  // La ciboulette est « au goût » : elle ne bloque pas la recette.
  assert.deepEqual(L.manquants(omelette, new Set(['oeuf', 'lait', 'jambon', 'emmental']), INGR), ['pain']);
});
