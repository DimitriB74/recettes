// Fonctions pures (calculs, filtres, liste de courses), partagées entre le
// navigateur (globales) et les tests Node (module.exports).
(function (exporter) {
  const TRANCHES = [
    { max: 10, label: '⚡ Express — 10 min ou moins' },
    { max: 20, label: '⏱ 20 min ou moins' },
    { max: 30, label: '⏱ 30 min ou moins' },
    { max: 45, label: '⏱ 45 min ou moins' },
    { max: 60, label: '⏳ 1 h ou moins' },
    { max: 120, label: '🍲 2 h ou moins' },
    { max: Infinity, label: '🔥 Plus de 2 h (mijotés)' },
  ];

  const tempsTotal = (r) => r.prep + r.cuisson + (r.repos || 0);
  const tranche = (min) => TRANCHES.findIndex((t) => min <= t.max);
  const typeDe = (r) => r.type || 'autre';

  // 45 → « 45 min », 60 → « 1 h », 210 → « 3 h 30 ».
  function duree(min) {
    if (min < 60) return `${min} min`;
    const m = min % 60;
    return `${Math.floor(min / 60)} h${m ? ' ' + String(m).padStart(2, '0') : ''}`;
  }

  // Coût des quantités utilisées, par portion, en euros. Prix au kg (ou au litre)
  // pour les ingrédients en g / ml, à l'unité sinon. « Au goût » et facultatifs non comptés.
  function cout(r, INGR, PRIX) {
    let total = 0;
    for (const [cle, q] of lignesUtiles(r)) {
      const u = INGR[cle].u;
      total += (u === 'g' || u === 'ml' ? q / 1000 : q) * (PRIX[cle] || 0);
    }
    return Math.round((total / r.portions) * 100) / 100;
  }
  const euros = (x) => `${x.toFixed(2).replace('.', ',')} €`;

  // Lignes comptées dans les calculs : ni facultatives, ni « au goût ».
  const lignesUtiles = (r) => r.ingr.filter(([, q, , opt]) => !opt && q != null);

  // Valeurs par portion.
  function nutrition(r, INGR) {
    const t = { p: 0, l: 0, gl: 0, kcal: 0, legumes: 0, feculent: false };
    for (const [cle, q] of lignesUtiles(r)) {
      const ing = INGR[cle];
      const g = q * ing.poids;
      t.p += (g * ing.p) / 100;
      t.l += (g * ing.l) / 100;
      t.gl += (g * ing.gl) / 100;
      t.kcal += (g * ing.kcal) / 100;
      if (ing.cat === 'legume') t.legumes += g;
      // Les légumes secs comptent comme féculents (repères PNNS).
      if (ing.cat === 'feculent' || ing.cat === 'legumineuse') t.feculent = true;
    }
    const n = r.portions;
    const res = {
      p: Math.round(t.p / n),
      l: Math.round(t.l / n),
      gl: Math.round(t.gl / n),
      kcal: Math.round(t.kcal / n / 10) * 10,
      legumes: Math.round(t.legumes / n / 10) * 10,
      feculent: t.feculent,
    };
    // Part de l'énergie apportée par chaque macronutriment (4 / 9 / 4 kcal/g).
    const e = res.p * 4 + res.l * 9 + res.gl * 4 || 1;
    res.pctP = Math.round((res.p * 4 * 100) / e);
    res.pctL = Math.round((res.l * 9 * 100) / e);
    res.pctG = 100 - res.pctP - res.pctL;
    return res;
  }

  const estVegetarien = (r, INGR) => !r.ingr.some(([cle]) => ['viande', 'poisson'].includes(INGR[cle].cat));

  // Arrondi adapté à l'unité : grammes au 5 près, le reste au quart près.
  function arrondir(q, unite) {
    if (q == null) return null;
    if (unite === 'g' || unite === 'ml') return q >= 20 ? Math.round(q / 5) * 5 : Math.max(1, Math.round(q));
    return Math.max(0.25, Math.round(q * 4) / 4);
  }

  const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  function nombre(q) {
    const ent = Math.floor(q);
    const frac = Math.round((q - ent) * 100) / 100;
    if (frac === 0) return String(ent);
    if (FRACTIONS[frac]) return ent ? `${ent} ${FRACTIONS[frac]}` : FRACTIONS[frac];
    return String(q).replace('.', ',');
  }

  const PLURIELS = { boîte: 'boîtes', tranche: 'tranches', gousse: 'gousses', cube: 'cubes' };

  // Quantité + nom affichables, ex. { qte: '2 gousses', nom: 'ail' }.
  function libelle(cle, q, INGR) {
    const ing = INGR[cle];
    if (q == null) return { qte: '', nom: ing.n };
    const n = nombre(q);
    const plus = q > 1;
    if (ing.u === 'g' || ing.u === 'ml') {
      if (q >= 1000) return { qte: `${nombre(Math.round(q / 100) / 10)} ${ing.u === 'g' ? 'kg' : 'L'}`, nom: ing.n };
      return { qte: `${n} ${ing.u}`, nom: ing.n };
    }
    if (ing.u === 'pièce') return { qte: n, nom: plus && ing.np ? ing.np : ing.n };
    const u = plus && PLURIELS[ing.u] ? PLURIELS[ing.u] : ing.u;
    return { qte: `${n} ${u}`, nom: ing.n };
  }

  // Ingrédients d'une recette pour un nombre de portions donné.
  function aLEchelle(r, portions, INGR) {
    const f = portions / r.portions;
    return r.ingr.map(([cle, q, note, opt]) => ({
      cle,
      q: q == null ? null : arrondir(q * f, INGR[cle].u),
      note: note || '',
      opt: !!opt,
    }));
  }

  // Ingrédients que l'on n'a pas, parmi ceux qui comptent (hors placard, facultatifs et « au goût »).
  function manquants(r, frigo, INGR) {
    return [...new Set(lignesUtiles(r).filter(([cle]) => !INGR[cle].base && !frigo.has(cle)).map(([cle]) => cle))];
  }

  // « Œufs » doit être trouvé en tapant « oeuf » : NFD ne décompose pas les ligatures.
  const sansAccents = (s) => s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // f : { texte, proteine, tempsMax, type, materiel, protMin, coutMax, vege, batch, ids (Set ou null) }
  // ctx.couts (coût par portion, par id) n'est utile qu'avec f.coutMax.
  function filtrer(recettes, f, ctx) {
    const { INGR, PROTEINES, nutr, couts } = ctx;
    const mots = sansAccents(f.texte || '').split(/\s+/).filter(Boolean);
    return recettes.filter((r) => {
      if (f.ids && !f.ids.has(r.id)) return false;
      if (f.proteine) {
        const cles = PROTEINES[f.proteine].cles;
        if (r.proteine !== f.proteine && !r.ingr.some(([cle, , , opt]) => !opt && cles.includes(cle))) return false;
      }
      if (f.tempsMax && tempsTotal(r) > f.tempsMax) return false;
      if (f.type && typeDe(r) !== f.type) return false;
      if (f.coutMax && couts[r.id] > f.coutMax) return false;
      if (f.materiel === 'micro' && r.materiel.some((m) => m !== 'micro-ondes')) return false;
      if (f.materiel === 'sans' && r.materiel.length) return false;
      if (f.materiel === 'un' && r.materiel.length > 1) return false;
      if (f.protMin && nutr[r.id].p < f.protMin) return false;
      if (f.vege && !estVegetarien(r, INGR)) return false;
      if (f.batch && !r.conservation) return false;
      if (f.classique && !r.classique) return false;
      if (mots.length) {
        const texte = sansAccents([r.titre, r.resume, ...r.ingr.map(([cle]) => INGR[cle].n)].join(' '));
        if (!mots.every((m) => texte.includes(m))) return false;
      }
      return true;
    });
  }

  const TRIS = {
    temps: (a, b, n) => tempsTotal(a) - tempsTotal(b) || n[b.id].p - n[a.id].p,
    proteines: (a, b, n) => n[b.id].p - n[a.id].p,
    kcal: (a, b, n) => n[a.id].kcal - n[b.id].kcal,
    ratio: (a, b, n) => n[b.id].p / n[b.id].kcal - n[a.id].p / n[a.id].kcal,
    cout: (a, b, n, c) => c[a.id] - c[b.id],
  };
  const trier = (recettes, cle, nutr, couts) => [...recettes].sort((a, b) => TRIS[cle](a, b, nutr, couts));

  // selection : [{ id, portions }]. Additionne les quantités par ingrédient.
  function listeCourses(selection, RECETTES, INGR, RAYONS) {
    const totaux = new Map();
    const placard = new Set();
    const auGout = new Set();
    for (const { id, portions } of selection) {
      const r = RECETTES.find((x) => x.id === id);
      if (!r) continue;
      for (const [cle, q, , opt] of r.ingr) {
        if (opt) continue;
        if (INGR[cle].base) { placard.add(cle); continue; }
        if (q == null) { auGout.add(cle); continue; }
        totaux.set(cle, (totaux.get(cle) || 0) + (q * portions) / r.portions);
      }
    }
    const parRayon = new Map(Object.keys(RAYONS).map((k) => [k, []]));
    for (const [cle, q] of totaux) {
      const ing = INGR[cle];
      // On achète des œufs ou des boîtes entières : arrondi au-dessus.
      const qa = ing.u === 'g' || ing.u === 'ml' ? arrondir(q, ing.u) : Math.ceil(q - 0.01);
      parRayon.get(ing.r).push({ cle, ...libelle(cle, qa, INGR) });
    }
    for (const cle of auGout) {
      if (!totaux.has(cle)) parRayon.get(INGR[cle].r).push({ cle, qte: '', nom: INGR[cle].n });
    }
    const rayons = [...parRayon]
      .filter(([, items]) => items.length)
      .map(([k, items]) => ({ cle: k, nom: RAYONS[k], items: items.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) }));
    return { rayons, placard: [...placard].map((cle) => ({ cle, nom: INGR[cle].n })) };
  }

  exporter({ TRANCHES, tempsTotal, tranche, typeDe, duree, cout, euros, nutrition, estVegetarien, arrondir, nombre, libelle, aLEchelle, manquants, filtrer, trier, listeCourses, sansAccents });
})(typeof module === 'object'
  ? (o) => { module.exports = o; }
  : (o) => { window.Logique = o; });
