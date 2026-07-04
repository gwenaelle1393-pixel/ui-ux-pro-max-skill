/* Kult — persistance (localStorage) et moteur de recommandation */

const Store = {
  KEY: "kult:v1",
  state: null,

  defaults() {
    return {
      // id -> 1 (like) | 2 (super-like) | -1 (passé)
      swipes: {},
      // Listes : favoris, à découvrir (watchlist), terminés
      lists: { fav: [], todo: [], done: [] },
      onboarded: false,
      kindFilter: "tout",
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.state = raw ? { ...this.defaults(), ...JSON.parse(raw) } : this.defaults();
    } catch {
      this.state = this.defaults();
    }
    return this.state;
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch {
      /* stockage plein ou indisponible : l'app reste utilisable en mémoire */
    }
  },

  reset() {
    this.state = this.defaults();
    this.state.onboarded = true;
    this.save();
  },

  swipe(id, value) {
    this.state.swipes[id] = value;
    if (value > 0) this.addTo("todo", id);
    if (value === 2) this.addTo("fav", id);
    this.save();
  },

  unswipe(id) {
    const value = this.state.swipes[id];
    delete this.state.swipes[id];
    if (value > 0) this.removeFrom("todo", id);
    if (value === 2) this.removeFrom("fav", id);
    this.save();
    return value;
  },

  addTo(list, id) {
    if (!this.state.lists[list].includes(id)) this.state.lists[list].unshift(id);
    if (list === "done") this.removeFrom("todo", id);
    this.save();
  },

  removeFrom(list, id) {
    const arr = this.state.lists[list];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    this.save();
  },

  inList(list, id) {
    return this.state.lists[list].includes(id);
  },

  /* Note un titre sans effet de bord sur les listes (feedback "déjà vu/lu") */
  rate(id, value) {
    this.state.swipes[id] = value;
    this.save();
  },
};

const Reco = {
  /* Profil de goûts : poids par genre / type / créateur, déduits des swipes.
   * like = +1, super-like = +2, passé = -0.6 */
  profile() {
    const genres = {};
    const kinds = {};
    const creators = {};
    let signals = 0;

    for (const [id, value] of Object.entries(Store.state.swipes)) {
      const item = BY_ID[id];
      if (!item) continue;
      const w = value === 2 ? 2 : value === 1 ? 1 : -0.6;
      if (value > 0) signals++;
      for (const g of item.g) genres[g] = (genres[g] || 0) + w;
      kinds[item.k] = (kinds[item.k] || 0) + w;
      creators[item.c] = (creators[item.c] || 0) + w;
    }
    // Les éléments marqués "terminés" ou favoris comptent aussi comme goûts positifs
    for (const id of [...Store.state.lists.done, ...Store.state.lists.fav]) {
      const item = BY_ID[id];
      if (!item || id in Store.state.swipes) continue;
      signals++;
      for (const g of item.g) genres[g] = (genres[g] || 0) + 1;
      kinds[item.k] = (kinds[item.k] || 0) + 1;
    }
    return { genres, kinds, creators, signals };
  },

  score(item, p) {
    let s = item.r / 10; // qualité de base (0–1)
    if (!p.signals) return s;
    let gs = 0;
    for (const g of item.g) gs += p.genres[g] || 0;
    s += 1.4 * (gs / item.g.length / Math.max(2, p.signals));
    s += 0.5 * ((p.kinds[item.k] || 0) / Math.max(2, p.signals));
    s += 0.6 * Math.min(1, Math.max(-1, (p.creators[item.c] || 0) / 2));
    return s;
  },

  /* File de découverte : non swipés, non terminés, filtrés par type.
   * Tri par score avec une part d'exploration (1 carte sur 4 est tirée
   * plus loin dans le classement pour éviter la bulle de filtre). */
  deck(kindFilter) {
    const p = this.profile();
    const pool = CATALOG.filter(
      (x) =>
        !(x.id in Store.state.swipes) &&
        !Store.inList("done", x.id) &&
        (kindFilter === "tout" || x.k === kindFilter)
    );
    const ranked = pool
      .map((x) => ({ x, s: this.score(x, p) }))
      .sort((a, b) => b.s - a.s);

    const out = [];
    const rest = [...ranked];
    while (rest.length) {
      const explore = p.signals >= 3 && out.length % 4 === 3 && rest.length > 5;
      const i = explore ? 5 + Math.floor(Math.random() * (rest.length - 5)) : 0;
      out.push(rest.splice(i, 1)[0]);
    }
    return { items: out.map((e) => e.x), scores: new Map(out.map((e) => [e.x.id, e.s])), profile: p };
  },

  /* Seuil "coup de cœur probable" : top 20 % des scores du deck courant */
  isStrongMatch(id, deckInfo) {
    if (deckInfo.profile.signals < 3) return false;
    const scores = [...deckInfo.scores.values()].sort((a, b) => b - a);
    const cutoff = scores[Math.max(0, Math.floor(scores.length * 0.2) - 1)];
    return (deckInfo.scores.get(id) ?? 0) >= cutoff && scores.length > 5;
  },

  /* Suggestions "Pour toi" (recherche vide) */
  suggestions(n = 8) {
    const p = this.profile();
    return CATALOG.filter((x) => !(x.id in Store.state.swipes) && !Store.inList("done", x.id))
      .map((x) => ({ x, s: this.score(x, p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((e) => e.x);
  },
};

const BY_ID = Object.fromEntries(CATALOG.map((x) => [x.id, x]));
