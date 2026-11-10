// Interface : liste filtrable, fiche recette, favoris, liste de courses.
(() => {
  const { TRANCHES, tempsTotal, tranche, typeDe, duree, cout, euros, nutrition, estVegetarien, libelle, aLEchelle, manquants, filtrer, trier, listeCourses } = window.Logique;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const nutr = Object.fromEntries(RECETTES.map((r) => [r.id, nutrition(r, INGR)]));
  const couts = Object.fromEntries(RECETTES.map((r) => [r.id, cout(r, INGR, PRIX)]));
  const parId = new Map(RECETTES.map((r) => [r.id, r]));
  const BASIQUES = ['oeuf', 'lentilles_vertes', 'lentilles_corail', 'poulet', 'fromage_blanc', 'lardons', 'sardine', 'thon',
    'ail', 'oignon', 'carotte', 'poireau', 'potimarron'];

  // Stockage local : peut être indisponible (navigation privée…), la page marche quand même.
  const lire = (k, def) => { try { const v = localStorage.getItem('recettes.' + k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const ecrire = (k, v) => { try { localStorage.setItem('recettes.' + k, JSON.stringify(v)); } catch { /* sans stockage */ } };

  const FILTRES_VIDES = { texte: '', proteine: '', tempsMax: 0, type: '', materiel: '', protMin: 0, coutMax: 0, vege: false, batch: false, classique: false };
  const etat = {
    vue: 'recettes',
    f: { ...FILTRES_VIDES },
    // Un choix enregistré par une ancienne version (ex. « moment ») retombe sur le défaut.
    groupe: ['temps', 'proteine', 'type', 'aucun'].includes(lire('groupe')) ? lire('groupe') : 'temps',
    tri: ['temps', 'proteines', 'kcal', 'ratio', 'cout'].includes(lire('tri')) ? lire('tri') : 'temps',
    favoris: new Set(lire('favoris', [])),
    courses: lire('courses', []).filter((c) => parId.has(c.id)),
    coches: new Set(lire('coches', [])),
    frigo: new Set(lire('frigo', [])),
    portions: {},
  };

  // ───────── Filtres ─────────
  function initFiltres() {
    $('#f-proteine').innerHTML = [['', 'Toutes', '🍽'], ...Object.entries(PROTEINES).map(([k, p]) => [k, p.label, p.emoji])]
      .map(([k, label, emo]) => `<button type="button" class="puce" data-proteine="${k}" aria-pressed="${k === ''}">${emo} ${label}</button>`).join('');
    $('#f-type').insertAdjacentHTML('beforeend', Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
    // Filtres dépliés sur grand écran, repliés sur téléphone.
    $('#plus-filtres').open = matchMedia('(min-width: 721px)').matches;
    $('#o-groupe').value = etat.groupe;
    $('#o-tri').value = etat.tri;

    $('#f-proteine').addEventListener('click', (e) => {
      const b = e.target.closest('[data-proteine]');
      if (!b) return;
      etat.f.proteine = b.dataset.proteine;
      majPuces();
      rendreListe();
    });
    $('#filtres').addEventListener('input', (e) => {
      const el = e.target;
      if (el.closest('#frigo')) return;
      if (el.id === 'o-groupe' || el.id === 'o-tri') {
        etat[el.id.slice(2)] = el.value;
        ecrire(el.id.slice(2), el.value);
      } else if (el.id.startsWith('f-')) {
        const k = el.id.slice(2);
        etat.f[k] = el.type === 'checkbox' ? el.checked : typeof FILTRES_VIDES[k] === 'number' ? Number(el.value) : el.value;
      }
      rendreListe();
    });
    $('#btn-reset').addEventListener('click', () => {
      etat.f = { ...FILTRES_VIDES };
      for (const [k, v] of Object.entries(FILTRES_VIDES)) {
        const el = $('#f-' + k);
        if (!el || el.tagName === 'DIV') continue;
        if (el.type === 'checkbox') el.checked = v; else el.value = v;
      }
      majPuces();
      rendreListe();
    });

    // Frigo : ingrédients utilisés par au moins une recette, hors placard.
    const utilises = new Set(RECETTES.flatMap((r) => r.ingr.filter(([cle, q, , opt]) => !opt && q != null && !INGR[cle].base).map(([cle]) => cle)));
    const parRayon = {};
    for (const cle of utilises) (parRayon[INGR[cle].r] ||= []).push(cle);
    $('#frigo-liste').innerHTML = Object.keys(RAYONS).filter((r) => parRayon[r]).map((r) => `
      <fieldset><legend>${RAYONS[r]}</legend><div class="frigo-choix">
        ${parRayon[r].sort((a, b) => INGR[a].n.localeCompare(INGR[b].n, 'fr')).map((cle) =>
          `<label><input type="checkbox" value="${cle}"${etat.frigo.has(cle) ? ' checked' : ''}> ${esc(INGR[cle].n)}</label>`).join('')}
      </div></fieldset>`).join('');
    $('#frigo').addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      e.target.checked ? etat.frigo.add(e.target.value) : etat.frigo.delete(e.target.value);
      majFrigo();
    });
    $('#frigo').addEventListener('click', (e) => {
      const action = e.target.dataset.frigo;
      if (!action) return;
      etat.frigo = new Set(action === 'basiques' ? [...etat.frigo, ...BASIQUES] : []);
      for (const cb of $('#frigo-liste').querySelectorAll('input')) cb.checked = etat.frigo.has(cb.value);
      majFrigo();
    });
    $('#btn-frigo').addEventListener('click', () => {
      const ouvert = $('#frigo').hidden;
      $('#frigo').hidden = !ouvert;
      $('#btn-frigo').setAttribute('aria-expanded', ouvert);
    });
    $('#resume').addEventListener('click', (e) => {
      if (e.target.dataset.action === 'sans-frigo') $('[data-frigo="vider"]').click();
    });
  }

  function majPuces() {
    for (const b of $('#f-proteine').children) b.setAttribute('aria-pressed', b.dataset.proteine === etat.f.proteine);
  }
  function majFrigo() {
    ecrire('frigo', [...etat.frigo]);
    $('#btn-frigo').textContent = etat.frigo.size ? `🧺 Ce que j’ai (${etat.frigo.size})` : '🧺 Ce que j’ai…';
    rendreListe();
  }

  // ───────── Liste ─────────
  function groupes(liste, manque) {
    if (manque) {
      const label = (n) => (n === 0 ? '✅ Tu as tout' : n === 1 ? '🛒 Il manque 1 ingrédient' : n === 2 ? '🛒 Il manque 2 ingrédients' : '🛒 Il manque 3 ingrédients ou plus');
      return grouperPar(liste, (r) => Math.min(manque[r.id].length, 3), label);
    }
    if (etat.groupe === 'temps') return grouperPar(liste, (r) => tranche(tempsTotal(r)), (i) => TRANCHES[i].label);
    if (etat.groupe === 'proteine') {
      const ordre = Object.keys(PROTEINES);
      return grouperPar(liste, (r) => ordre.indexOf(r.proteine), (i) => `${PROTEINES[ordre[i]].emoji} ${PROTEINES[ordre[i]].label}`);
    }
    if (etat.groupe === 'type') {
      const ordre = Object.keys(TYPES);
      return grouperPar(liste, (r) => ordre.indexOf(typeDe(r)), (i) => TYPES[ordre[i]]);
    }
    return [{ label: '', items: liste }];
  }
  function grouperPar(liste, cle, label) {
    const m = new Map();
    for (const r of liste) {
      const k = cle(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m].sort(([a], [b]) => a - b).map(([k, items]) => ({ label: label(k), items }));
  }

  function carte(r, manque) {
    const p = PROTEINES[r.proteine];
    const n = nutr[r.id];
    const tags = [
      ...r.materiel.map((m) => `${MATERIEL[m].emoji} ${MATERIEL[m].label}`),
      ...(r.materiel.length ? [] : ['🥗 Sans cuisson']),
      ...(estVegetarien(r, INGR) ? ['🌱 Végé'] : []),
      ...(r.conservation ? ['🧊 Se garde'] : []),
    ];
    let ligneManque = '';
    if (manque) {
      const m = manque[r.id];
      ligneManque = m.length
        ? `<p class="manque">Il te manque : ${esc(m.map((c) => INGR[c].n).join(', '))}</p>`
        : '<p class="manque complet">✓ Tu as tout ce qu’il faut</p>';
    }
    const fav = etat.favoris.has(r.id);
    return `<article class="carte" style="--c:${p.couleur}">
      <button type="button" class="carte-ouvrir" data-ouvrir="${r.id}">
        ${photo(r, 'carte-photo', 'lazy')}
        <div class="carte-corps">
          <h3>${esc(r.titre)}</h3>
          <p class="carte-resume">${esc(r.resume)}</p>
          <ul class="stats">
            <li>⏱ <b>${duree(tempsTotal(r))}</b></li>
            <li class="fort">💪 <b>${n.p} g</b> protéines</li>
            <li>🔥 ${n.kcal} kcal</li>
            <li>💶 ${euros(couts[r.id])}</li>
          </ul>
          <p class="tags">${tags.join(' · ')}</p>
          ${ligneManque}
        </div>
      </button>
      <button type="button" class="fav" data-fav="${r.id}" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des' : 'Ajouter aux'} favoris : ${esc(r.titre)}" title="Favori">★</button>
    </article>`;
  }

  // Photo de la recette, avec pastilles (protéine, classique). Sans photo : grand emoji sur la couleur de la protéine.
  function photo(r, classe, chargement) {
    const p = PROTEINES[r.proteine];
    const ph = PHOTOS[r.id];
    const img = ph
      ? `<img src="${esc(ph.src)}" alt="" width="${ph.w}" height="${ph.h}" loading="${chargement}" decoding="async">`
      : `<span class="sans-photo" aria-hidden="true">${p.emoji}</span>`;
    return `<div class="${classe}">${img}
      <span class="pastilles"><span class="pastille">${p.emoji} ${p.label}</span>${r.classique ? '<span class="pastille">🥖 Classique</span>' : ''}</span>
    </div>`;
  }

  function rendreListe() {
    const f = { ...etat.f, ids: etat.vue === 'favoris' ? etat.favoris : null };
    let liste = trier(filtrer(RECETTES, f, { INGR, PROTEINES, nutr, couts }), etat.tri, nutr, couts);
    const manque = etat.frigo.size ? Object.fromEntries(liste.map((r) => [r.id, manquants(r, etat.frigo, INGR)])) : null;

    const total = etat.vue === 'favoris' ? etat.favoris.size : RECETTES.length;
    let resume = `${liste.length} recette${liste.length > 1 ? 's' : ''} sur ${total}`;
    if (manque) resume += ` · classées selon ce que tu as (${etat.frigo.size} ingrédients cochés) <button type="button" class="discret" data-action="sans-frigo">Ne plus en tenir compte</button>`;
    $('#resume').innerHTML = resume;

    if (!liste.length) {
      $('#liste').innerHTML = etat.vue === 'favoris' && !etat.favoris.size
        ? '<p class="vide">Pas encore de favoris : touche l’étoile ★ d’une recette pour la retrouver ici.</p>'
        : '<p class="vide">Aucune recette ne correspond. Essaie d’enlever un filtre.</p>';
      return;
    }
    $('#liste').innerHTML = groupes(liste, manque).map((g) => `
      ${g.label ? `<h2 class="groupe">${g.label} <span>${g.items.length}</span></h2>` : ''}
      <div class="grille">${g.items.map((r) => carte(r, manque)).join('')}</div>`).join('');
  }

  // ───────── Fiche ─────────
  const dlg = $('#fiche');
  let ficheId = null;

  function portionsDe(r) { return etat.portions[r.id] || r.portions; }

  function rendreFiche() {
    const r = parId.get(ficheId);
    if (!r) return;
    const p = PROTEINES[r.proteine];
    const n = nutr[r.id];
    const nb = portionsDe(r);
    const lignes = aLEchelle(r, nb, INGR).map(({ cle, q, note, opt }) => {
      const { qte, nom } = libelle(cle, q, INGR);
      return `<li><span class="q">${qte || 'au goût'}</span><span>${esc(nom)}${note ? ` <span class="note">(${esc(note)})</span>` : ''}</span>${opt ? '<span class="opt">facultatif</span>' : ''}</li>`;
    }).join('');
    const enCourses = etat.courses.find((c) => c.id === r.id);
    const ok = (b) => (b ? '✅' : '➖');
    dlg.style.setProperty('--c', p.couleur);
    const ph = PHOTOS[r.id];
    dlg.innerHTML = `
      <button type="button" class="icone fermer" data-action="fermer" aria-label="Fermer la fiche">✕</button>
      ${photo(r, 'fiche-photo', 'eager')}
      <header class="fiche-tete">
        <p class="fiche-sur">${TYPES[typeDe(r)]}</p>
        <h2 id="fiche-titre">${esc(r.titre)}</h2>
        <p class="muted">${esc(r.resume)}</p>
      </header>
      <ul class="fiche-infos">
        <li><span>Préparation</span><b>${duree(r.prep)}</b></li>
        ${r.repos ? `<li><span>Repos / marinade</span><b>${duree(r.repos)}</b></li>` : ''}
        <li><span>Cuisson</span><b>${r.cuisson ? duree(r.cuisson) : 'aucune'}</b></li>
        <li><span>Temps total</span><b>${duree(tempsTotal(r))}</b></li>
        <li><span>Coût estimé</span><b>${euros(couts[r.id])} / portion</b></li>
        <li><span>Matériel</span><b>${r.materiel.length ? r.materiel.map((m) => `${MATERIEL[m].emoji} ${MATERIEL[m].label}`).join(', ') : '🥗 Aucun'}</b></li>
      </ul>
      <div class="fiche-corps">
        <section>
          <div class="portions">
            <h3>Ingrédients</h3>
            <div class="stepper" role="group" aria-label="Nombre de portions">
              <button type="button" data-portions="-1" aria-label="Une portion de moins">−</button>
              <output>${nb} portion${nb > 1 ? 's' : ''}</output>
              <button type="button" data-portions="1" aria-label="Une portion de plus">+</button>
            </div>
          </div>
          <ul class="ingr">${lignes}</ul>
          <h3>Par portion</h3>
          <div class="nutri">
            <div class="fort"><span>Protéines</span><b>${n.p} g</b></div>
            <div><span>Énergie</span><b>${n.kcal} kcal</b></div>
            <div><span>Glucides</span><b>${n.gl} g</b></div>
            <div><span>Lipides</span><b>${n.l} g</b></div>
          </div>
          <div class="macros" role="img" aria-label="Énergie : ${n.pctP} % protéines, ${n.pctG} % glucides, ${n.pctL} % lipides">
            <i style="width:${n.pctP}%"></i><i style="width:${n.pctL}%"></i><i style="width:${n.pctG}%"></i>
          </div>
          <p class="legende"><span><i style="background:var(--c)"></i>Protéines ${n.pctP} %</span><span><i style="background:#e3b23c"></i>Lipides ${n.pctL} %</span><span><i style="background:#8fb3d9"></i>Glucides ${n.pctG} %</span></p>
          <ul class="equilibre">
            <li>${ok(n.p >= 20)} ${n.p} g de protéines (objectif : 20 g et plus)</li>
            <li>${ok(n.legumes >= 150)} ${n.legumes} g de fruits et légumes</li>
            <li>${ok(n.feculent)} ${n.feculent ? 'Féculent ou légumes secs inclus' : 'Pas de féculent : ajoute du pain ou du riz si grosse faim'}</li>
          </ul>
          <p class="muted petit">Estimations par portion (± 10-15 %), ingrédients facultatifs non comptés. Coût : ${euros(couts[r.id] * nb)} pour ${nb} portion${nb > 1 ? 's' : ''}, prix de supérette estimés (± 20-30 %), quantités réellement utilisées ; sel, poivre et herbes fraîches non comptés.</p>
        </section>
        <section>
          <h3>Préparation</h3>
          <ol class="etapes">${r.etapes.map((e) => `<li><label><input type="checkbox"> <span>${esc(e)}</span></label></li>`).join('')}</ol>
          ${r.astuce ? `<p class="encart">💡 ${esc(r.astuce)}</p>` : ''}
          ${r.conservation ? `<p class="encart">🧊 ${esc(r.conservation)}</p>` : ''}
          <p class="source">Recette d’origine : <a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source.nom)}</a>${r.source.adaptation ? ` — adaptée : ${esc(r.source.adaptation)}` : ''}. Texte réécrit, quantités ajustées.</p>
          ${ph ? `<p class="source">Photo d’illustration : <a href="${esc(ph.page)}" target="_blank" rel="noopener noreferrer">${esc(ph.auteur)}</a>, ${esc(ph.licence)}, via Wikimedia Commons.</p>` : ''}
        </section>
      </div>
      <footer class="fiche-actions">
        <button type="button" class="discret" data-action="fav" aria-pressed="${etat.favoris.has(r.id)}">${etat.favoris.has(r.id) ? '★ Dans tes favoris' : '☆ Ajouter aux favoris'}</button>
        <button type="button" class="primaire" data-action="courses">🛒 ${!enCourses ? `Ajouter à la liste de courses (${nb} p.)` : enCourses.portions === nb ? `Dans la liste de courses (${nb} p.)` : `Mettre la liste à ${nb} p. (au lieu de ${enCourses.portions})`}</button>
        <button type="button" class="discret" data-action="imprimer">🖨 Imprimer</button>
      </footer>`;
  }

  function ouvrirFiche(id) {
    if (!parId.has(id)) return;
    ficheId = id;
    rendreFiche();
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }
  function fermerFiche() {
    if (dlg.open) dlg.close();
    ficheId = null;
  }

  dlg.addEventListener('click', (e) => {
    const cadre = dlg.getBoundingClientRect();
    const dehors = e.clientX < cadre.left || e.clientX > cadre.right || e.clientY < cadre.top || e.clientY > cadre.bottom;
    if (e.target === dlg && dehors) return quitterFiche(); // clic sur le fond
    const b = e.target.closest('button');
    if (!b) return;
    const r = parId.get(ficheId);
    if (b.dataset.portions) {
      etat.portions[r.id] = Math.min(12, Math.max(1, portionsDe(r) + Number(b.dataset.portions)));
      rendreFiche();
    } else if (b.dataset.action === 'fermer') quitterFiche();
    else if (b.dataset.action === 'fav') basculerFavori(r.id);
    else if (b.dataset.action === 'courses') {
      const c = etat.courses.find((x) => x.id === r.id);
      if (c) c.portions = portionsDe(r); else etat.courses.push({ id: r.id, portions: portionsDe(r) });
      sauverCourses();
      rendreFiche();
      $('.fiche-actions', dlg).insertAdjacentHTML('beforeend', '<span class="info">✓ Ajouté à la liste de courses</span>');
    } else if (b.dataset.action === 'imprimer') window.print();
  });
  dlg.addEventListener('close', () => { if (location.hash.startsWith('#recette/')) quitterFiche(); });

  // Fermer la fiche = revenir à la vue d'avant (le bouton retour du téléphone fait pareil).
  // Fiche ouverte par un lien direct : pas de page précédente, on remet la vue en cours.
  let vueAffichee = false;
  let ficheAvecRetour = false;
  function quitterFiche() {
    if (!location.hash.startsWith('#recette/')) return fermerFiche();
    if (ficheAvecRetour) history.back();
    else location.hash = etat.vue === 'recettes' ? '' : etat.vue;
  }

  function basculerFavori(id) {
    etat.favoris.has(id) ? etat.favoris.delete(id) : etat.favoris.add(id);
    ecrire('favoris', [...etat.favoris]);
    majCompteurs();
    if (ficheId) rendreFiche();
    if (etat.vue !== 'courses') rendreListe();
  }

  $('#liste').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) return basculerFavori(fav.dataset.fav);
    const o = e.target.closest('[data-ouvrir]');
    if (o) location.hash = 'recette/' + o.dataset.ouvrir;
  });

  // ───────── Courses ─────────
  function sauverCourses() {
    ecrire('courses', etat.courses);
    if (!etat.courses.length) { etat.coches.clear(); ecrire('coches', []); }
    majCompteurs();
  }

  function texteCourses(l) {
    const blocs = l.rayons.map((r) => `${r.nom}\n${r.items.map((i) => `- ${i.qte ? i.qte + ' ' : ''}${i.nom}`).join('\n')}`);
    if (l.placard.length) blocs.push(`Placard (vérifier)\n${l.placard.map((p) => `- ${p.nom}`).join('\n')}`);
    return blocs.join('\n\n');
  }

  function rendreCourses() {
    const v = $('#vue-courses');
    if (!etat.courses.length) {
      v.innerHTML = `<div class="courses-tete"><h2>🛒 Liste de courses</h2></div>
        <p class="vide">La liste est vide. Ouvre une recette et touche « Ajouter à la liste de courses » : les ingrédients de toutes tes recettes s’additionnent ici, rangés par rayon.</p>`;
      return;
    }
    const l = listeCourses(etat.courses, RECETTES, INGR, RAYONS);
    v.innerHTML = `
      <div class="courses-tete">
        <h2>🛒 Liste de courses <span class="muted">≈ ${euros(etat.courses.reduce((t, c) => t + couts[c.id] * c.portions, 0))}</span></h2>
        <div>
          <button type="button" class="discret" data-action="copier">📋 Copier la liste</button>
          <button type="button" class="discret" data-action="decocher">Tout décocher</button>
          <button type="button" class="discret" data-action="vider">Vider</button>
        </div>
      </div>
      <div class="panneau">
        <h3>${etat.courses.length} recette${etat.courses.length > 1 ? 's' : ''}</h3>
        <ul class="sel-recettes">${etat.courses.map((c) => {
          const r = parId.get(c.id);
          return `<li>
            <a href="#recette/${r.id}">${PROTEINES[r.proteine].emoji} ${esc(r.titre)}</a>
            <span class="stepper" role="group" aria-label="Portions pour ${esc(r.titre)}">
              <button type="button" data-id="${r.id}" data-delta="-1" aria-label="Une portion de moins">−</button>
              <output>${c.portions} portion${c.portions > 1 ? 's' : ''}</output>
              <button type="button" data-id="${r.id}" data-delta="1" aria-label="Une portion de plus">+</button>
            </span>
            <button type="button" class="retirer" data-retirer="${r.id}" aria-label="Retirer ${esc(r.titre)}" title="Retirer">✕</button>
          </li>`;
        }).join('')}</ul>
      </div>
      <div class="panneau rayons">
        ${l.rayons.map((r) => `<div class="rayon"><h3>${r.nom}</h3><ul>${r.items.map((i) => `
          <li><label><input type="checkbox" data-coche="${i.cle}"${etat.coches.has(i.cle) ? ' checked' : ''}> <b>${i.qte}</b> ${esc(i.nom)}</label></li>`).join('')}</ul></div>`).join('')}
        ${l.placard.length ? `<div class="rayon"><h3>Placard : vérifie que tu en as</h3><ul>${l.placard.map((p) => `
          <li><label><input type="checkbox" data-coche="${p.cle}"${etat.coches.has(p.cle) ? ' checked' : ''}> ${esc(p.nom)}</label></li>`).join('')}</ul></div>` : ''}
      </div>
      <p class="muted petit">Œufs, boîtes et légumes à la pièce sont arrondis à l’unité supérieure. Les ingrédients facultatifs ne sont pas ajoutés. Coût estimé sur les quantités utilisées : à la caisse, les paquets entiers coûtent plus, mais le reste sert pour d’autres repas.</p>`;
  }

  $('#vue-courses').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.delta) {
      const c = etat.courses.find((x) => x.id === b.dataset.id);
      c.portions = Math.min(20, Math.max(1, c.portions + Number(b.dataset.delta)));
    } else if (b.dataset.retirer) {
      etat.courses = etat.courses.filter((x) => x.id !== b.dataset.retirer);
    } else if (b.dataset.action === 'vider') {
      if (!confirm('Vider la liste de courses ?')) return;
      etat.courses = [];
    } else if (b.dataset.action === 'decocher') {
      etat.coches.clear();
      ecrire('coches', []);
    } else if (b.dataset.action === 'copier') {
      const texte = texteCourses(listeCourses(etat.courses, RECETTES, INGR, RAYONS));
      try {
        await navigator.clipboard.writeText(texte);
        b.textContent = '✓ Copiée';
      } catch {
        b.textContent = 'Copie impossible ici';
      }
      setTimeout(() => { b.textContent = '📋 Copier la liste'; }, 2000);
      return;
    } else return;
    sauverCourses();
    rendreCourses();
  });
  $('#vue-courses').addEventListener('change', (e) => {
    const cle = e.target.dataset.coche;
    if (!cle) return;
    e.target.checked ? etat.coches.add(cle) : etat.coches.delete(cle);
    ecrire('coches', [...etat.coches]);
  });

  // ───────── Navigation (#favoris, #courses, #recette/id) ─────────
  function majCompteurs() {
    $('#nb-recettes').textContent = RECETTES.length;
    $('#nb-favoris').textContent = etat.favoris.size || '';
    $('#nb-courses').textContent = etat.courses.length || '';
  }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('recette/')) {
      ficheAvecRetour = vueAffichee;
      ouvrirFiche(h.slice(8));
      return;
    }
    vueAffichee = true;
    fermerFiche();
    etat.vue = h === 'favoris' || h === 'courses' ? h : 'recettes';
    for (const a of document.querySelectorAll('.onglets a')) {
      if (a.dataset.vue === etat.vue) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    $('#vue-recettes').hidden = etat.vue === 'courses';
    $('#vue-courses').hidden = etat.vue !== 'courses';
    if (etat.vue === 'courses') rendreCourses(); else rendreListe();
  }
  window.addEventListener('hashchange', route);

  // ───────── Thème ─────────
  const theme = lire('theme', null);
  if (theme) document.documentElement.dataset.theme = theme;
  $('#btn-theme').addEventListener('click', () => {
    const sombre = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = sombre ? 'light' : 'dark';
    ecrire('theme', document.documentElement.dataset.theme);
  });

  // Application installable et utilisable hors connexion (https ou localhost uniquement).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* le site marche aussi sans */ });
  }

  initFiltres();
  majCompteurs();
  if (etat.frigo.size) majFrigo();
  // Une fiche ouverte directement par lien : la vue d'arrière-plan reste « Recettes ».
  if (location.hash.startsWith('#recette/')) rendreListe();
  route();
})();
