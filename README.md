# Recettes protéinées

Site de recettes équilibrées et riches en protéines, **sans four** (plaques
vitrocéramiques + micro-ondes), avec des ingrédients de supérette.

- 61 recettes de repas (pas de petit-déjeuner) trouvées en ligne, réécrites et adaptées
  (lien vers l’original sur chaque fiche), dont 25 classiques de la cuisine française,
  17 mijotés de grand-mère à feu doux et 6 soupes et potages.
- Une photo par plat (Wikimedia Commons, auteur et licence cités sur la fiche).
- Coût estimé par portion sur chaque recette, et total de la liste de courses.
- Installable sur téléphone (« Ajouter à l’écran d’accueil ») et utilisable hors connexion
  une fois ouvert en ligne.
- Protéines de base : œufs, lentilles, poulet, fromage blanc, lardons, sardines, thon.
- Légumes de base : ail, oignon, carotte, poireau, potimarron.

## Ouvrir le site

Double-cliquer sur `index.html` (aucun serveur ni installation nécessaire).

## Fonctions

- Fiches classées par **temps total** (de « 10 min » à « plus de 2 h »), par protéine
  ou par type de plat (mijotés, soupes, autres).
- Filtres : protéine, temps, type de plat, coût par portion, type de cuisson (micro-ondes
  seul, sans cuisson, un seul ustensile), protéines minimum, végétarien, « se garde »
  (batch cooking), recherche.
- Tri : temps, protéines, calories, protéines pour 100 kcal, coût.
- **Ce que j’ai** : coche ce que tu as, les recettes sont classées selon ce qu’il manque.
- Fiche : quantités recalculées selon le nombre de portions, étapes à cocher pendant
  la cuisson, valeurs nutritionnelles par portion, impression.
- **Favoris** et **liste de courses** (ingrédients additionnés et rangés par rayon,
  copie en texte). Sauvegardés dans le navigateur (`localStorage`), sur cet appareil seulement.

## Valeurs nutritionnelles

Calculées automatiquement à partir des ingrédients (`donnees.js`, table `INGR`,
valeurs pour 100 g). Ce sont des **ordres de grandeur** (table Ciqual de l’Anses,
étiquettes courantes), à ± 10-15 %, pas des mesures. Seules quelques valeurs
ont été recoupées en ligne (lentilles, sardines, thon).

## Coût par repas

Calculé sur les quantités réellement utilisées, avec la table `PRIX` de `donnees.js`
(€ le kg ou le litre pour les ingrédients en g / ml, € l’unité sinon). Prix de
supérette **estimés** (type Carrefour City, fin 2026), à ± 20-30 %, calés sur
quelques relevés de promotions Carrefour Market 2026 (filet de poulet, lardons,
bourguignon) ; le reste est estimé. Sel, poivre et herbes fraîches non comptés.
À la caisse, on paie des paquets entiers : la note du jour est plus élevée, mais
le reste sert pour d’autres repas.

## Photos

Les photos sont des **photos d’illustration** du plat (pas de la recette exacte), prises
sur Wikimedia Commons sous licence libre (CC BY, CC BY-SA, CC0, domaine public…).
`scripts/photos.mjs` choisit une image par recette selon la règle de `SPECS`
(article Wikipédia, recherche Commons ou fichier précis), la télécharge en 640 px
dans `img/` et écrit `photos.js` avec l’auteur et la licence.

```bash
node scripts/photos.mjs
```

Une photo qui ne convient pas : remplacer sa règle par `'f:Nom_du_fichier.jpg'`
(nom vu sur commons.wikimedia.org), puis relancer avec `--forcer id-de-la-recette`.

## Ajouter une recette

Ajouter un objet dans `RECETTES` (`donnees.js`) en suivant les autres. Chaque
ingrédient est `[clé, quantité, note, facultatif]`, la clé devant exister dans `INGR`
et avoir un prix dans `PRIX`. `type: 'mijote'` ou `type: 'soupe'` la range dans ces
catégories, `classique: true` dans les classiques français. Ajouter sa règle de photo
dans `scripts/photos.mjs` et lancer ce script. Puis lancer les tests :

```bash
node --test tests/recettes.test.js
```

Ils vérifient notamment : ingrédients connus et chiffrés, aucune mention de four,
au moins 20 g de protéines par portion, calories et coût plausibles (0,50 à 6 €
par portion), calcul de la liste de courses.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | page et mise en forme (thème clair/sombre) |
| `donnees.js` | ingrédients, valeurs nutritionnelles, prix, recettes |
| `logique.js` | calculs purs (nutrition, coût, durées, filtres, portions, courses) |
| `app.js` | interface |
| `photos.js`, `img/` | photos et leurs crédits (générés par `scripts/photos.mjs`) |
| `manifest.webmanifest`, `sw.js`, `icons/` | installation sur téléphone et hors connexion (`scripts/icones.mjs` génère les icônes) |
| `tests/recettes.test.js` | tests (`node --test`) |
