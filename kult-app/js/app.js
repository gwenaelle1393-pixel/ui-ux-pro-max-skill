/* Kult — interface : routing, deck de swipe, recherche, listes, profil */
(() => {
  "use strict";

  const view = document.getElementById("view");
  const overlays = document.getElementById("overlays");
  const live = document.getElementById("live");

  Store.load();

  /* ── Utilitaires ─────────────────────────────────── */

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const icon = (name, cls = "icon") =>
    `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const KIND_ICON = { film: "film", serie: "tv", livre: "book" };

  const normalize = (s) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const fmtRating = (r) => r.toFixed(1).replace(".", ",");

  /* Jaquettes : fichiers locaux, ou data-URI injectées (version single-file) */
  const imgSrc = (id) => (window.KULT_IMG ? KULT_IMG[id] || "" : `img/${id}.jpg`);

  // Image introuvable → on retire la balise, l'affiche générative reste visible
  document.addEventListener("error", (e) => {
    if (e.target?.classList?.contains("poster-img")) e.target.remove();
  }, true);

  const haptic = (ms = 12) => {
    if (navigator.vibrate) navigator.vibrate(ms);
  };

  const announce = (msg) => {
    live.textContent = "";
    requestAnimationFrame(() => (live.textContent = msg));
  };

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /* ── Toast ───────────────────────────────────────── */

  let toastTimer = null;
  function toast(msg, { match = false } = {}) {
    document.querySelector(".toast")?.remove();
    clearTimeout(toastTimer);
    const t = document.createElement("div");
    t.className = "toast" + (match ? " match" : "");
    t.innerHTML = `${icon(match ? "sparkles" : "check")}<span>${esc(msg)}</span>`;
    document.body.appendChild(t);
    announce(msg);
    toastTimer = setTimeout(() => {
      t.classList.add("hide");
      setTimeout(() => t.remove(), 250);
    }, 3200);
  }

  /* ── Dialogue de confirmation ────────────────────── */

  function confirmDialog({ title, text, confirmLabel, onConfirm }) {
    const wrap = document.createElement("div");
    wrap.className = "confirm";
    wrap.innerHTML = `
      <div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="row-of-btns">
          <button class="btn btn-ghost" data-act="cancel">Annuler</button>
          <button class="btn btn-danger" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.closest('[data-act="cancel"]')) close();
      if (e.target.closest('[data-act="ok"]')) { close(); onConfirm(); }
    });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    overlays.appendChild(wrap);
    wrap.querySelector('[data-act="cancel"]').focus();
  }

  /* ── Feuille de détails ──────────────────────────── */

  let sheetEl = null;
  let sheetReturnFocus = null;

  function metaLine(item) {
    return `${KIND_LABEL[item.k]} · ${item.y} · ${esc(item.m)} · ${esc(item.c)}`;
  }

  function openSheet(item, { fromHistory = false } = {}) {
    closeSheet({ instant: true });
    sheetReturnFocus = document.activeElement;
    if (!fromHistory) history.pushState({ sheet: item.id }, "", location.hash);

    const inTodo = Store.inList("todo", item.id);
    const inFav = Store.inList("fav", item.id);
    const inDone = Store.inList("done", item.id);
    const doneLabel = item.k === "livre" ? "Lu" : item.k === "serie" ? "Vue" : "Vu";

    sheetEl = document.createElement("div");
    sheetEl.innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" style="--h:${item.h}">
        <div class="sheet-handle" aria-hidden="true"></div>
        <button class="sheet-close" data-close aria-label="Fermer la fiche">${icon("x")}</button>
        <div class="sheet-scroll">
          <div class="sheet-head">
            <div class="sheet-cover" style="--h:${item.h}">
              ${icon(KIND_ICON[item.k])}
              <img class="poster-img" src="${imgSrc(item.id)}" alt="Jaquette de ${esc(item.t)}" />
            </div>
            <div class="sheet-headings">
              <h2 id="sheet-title">${esc(item.t)}</h2>
              <p class="poster-meta"><span class="badge-rating">${icon("star")}${fmtRating(item.r)}</span></p>
              <p class="poster-meta">${metaLine(item)}</p>
            </div>
          </div>
          <div class="poster-genres">${item.g.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div>
          <p class="sheet-desc">${esc(item.d)}</p>
          <div class="sheet-actions">
            <button class="btn btn-ghost" data-toggle="todo" aria-pressed="${inTodo}">${icon("bookmark")} À découvrir</button>
            <button class="btn btn-ghost" data-toggle="fav" aria-pressed="${inFav}">${icon("star")} Favori</button>
            <button class="btn btn-ghost" data-toggle="done" aria-pressed="${inDone}">${icon("check")} ${doneLabel}</button>
            <button class="btn btn-ghost" data-toggle="skip">${icon("x")} Pas pour moi</button>
          </div>
        </div>
      </div>`;

    sheetEl.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) { history.back(); return; }
      const btn = e.target.closest("[data-toggle]");
      if (!btn) return;
      const kind = btn.dataset.toggle;
      haptic();
      if (kind === "skip") {
        Store.swipe(item.id, -1);
        Store.removeFrom("todo", item.id);
        Store.removeFrom("fav", item.id);
        const qi = deckState.queue.indexOf(item);
        if (qi >= 0) {
          deckState.queue.splice(qi, 1);
          if (routes.current === "decouvrir") renderStack();
        }
        toast(`« ${item.t} » ne te sera plus proposé`);
        history.back();
        return;
      }
      const on = btn.getAttribute("aria-pressed") === "true";
      if (on) Store.removeFrom(kind, item.id);
      else Store.addTo(kind, item.id);
      btn.setAttribute("aria-pressed", String(!on));
      const labels = { todo: "À découvrir", fav: "Favoris", done: "Vus / Lus" };
      toast(on ? `Retiré de « ${labels[kind]} »` : `Ajouté à « ${labels[kind]} »`);
      if (routes.current === "listes") renderLists.refresh?.();
    });
    sheetEl.addEventListener("keydown", (e) => { if (e.key === "Escape") history.back(); });

    overlays.appendChild(sheetEl);
    sheetEl.querySelector(".sheet-close").focus();
  }

  function closeSheet({ instant = false } = {}) {
    if (!sheetEl) return;
    const el = sheetEl;
    sheetEl = null;
    if (instant || reducedMotion.matches) el.remove();
    else {
      el.querySelector(".sheet").classList.add("closing");
      el.querySelector(".sheet-backdrop").style.opacity = "0";
      setTimeout(() => el.remove(), 220);
    }
    sheetReturnFocus?.focus?.();
    sheetReturnFocus = null;
  }

  window.addEventListener("popstate", () => {
    if (sheetEl) closeSheet();
  });

  /* ── Affiches générées ───────────────────────────── */

  function posterCard(item, matchBadge) {
    return `
      <article class="poster" style="--h:${item.h}">
        <div class="poster-top">
          <span class="badge-kind">${icon(KIND_ICON[item.k])}${KIND_LABEL[item.k]}</span>
          <span class="badge-rating">${icon("star")}${fmtRating(item.r)}</span>
        </div>
        <div class="poster-art" aria-hidden="true">${icon(KIND_ICON[item.k], "")}</div>
        <img class="poster-img" src="${imgSrc(item.id)}" alt="" />
        <div class="poster-bottom">
          ${matchBadge ? `<span class="badge-match">${icon("sparkles")}Recommandé pour toi</span>` : ""}
          <h2 class="poster-title">${esc(item.t)}</h2>
          <p class="poster-meta">${metaLine(item)}</p>
          <div class="poster-genres">${item.g.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div>
        </div>
        <span class="stamp stamp-like" aria-hidden="true">LIKE</span>
        <span class="stamp stamp-nope" aria-hidden="true">PASSE</span>
        <span class="stamp stamp-super" aria-hidden="true">COUP DE CŒUR</span>
        <span class="stamp stamp-seen" aria-hidden="true">${item.k === "livre" ? "DÉJÀ LU" : "DÉJÀ VU"}</span>
      </article>`;
  }

  function miniCard(item) {
    return `
      <button class="mini-card" data-open="${item.id}" aria-label="${esc(item.t)}, ${KIND_LABEL[item.k]}, note ${fmtRating(item.r)} sur 10">
        <span class="mini-poster" style="--h:${item.h}">
          <span class="mini-art" aria-hidden="true">${icon(KIND_ICON[item.k], "")}</span>
          <img class="poster-img" src="${imgSrc(item.id)}" alt="" loading="lazy" />
          <span class="mini-title">${esc(item.t)}</span>
          <span class="mini-sub">${icon(KIND_ICON[item.k])}${KIND_LABEL[item.k]} · ${item.y}</span>
        </span>
      </button>`;
  }

  /* ── Vue : Découvrir ─────────────────────────────── */

  const deckState = { queue: [], info: null, history: [], busy: false };

  function buildDeck() {
    const info = Reco.deck(Store.state.kindFilter);
    deckState.queue = info.items;
    deckState.info = info;
  }

  function renderDiscover() {
    buildDeck();
    view.innerHTML = `
      <header class="app-header">
        <h1 class="logo">Kult</h1>
      </header>
      <div class="chips" role="group" aria-label="Filtrer par type">
        ${["tout", "film", "serie", "livre"].map((k) => `
          <button class="chip" data-kind="${k}" aria-pressed="${Store.state.kindFilter === k}">
            ${k === "tout" ? "Tout" : KIND_PLURAL[k]}
          </button>`).join("")}
      </div>
      <div class="deck-wrap">
        <div class="deck" id="deck"></div>
        <div class="deck-actions">
          <button class="act act-undo" id="act-undo" aria-label="Annuler le dernier swipe" disabled>${icon("undo")}</button>
          <button class="act act-nope" id="act-nope" aria-label="Passer">${icon("x")}</button>
          <button class="act act-seen" id="act-seen" aria-label="Déjà vu ou lu">${icon("eye")}</button>
          <button class="act act-super" id="act-super" aria-label="Coup de cœur">${icon("star")}</button>
          <button class="act act-like" id="act-like" aria-label="J'aime, ajouter à ma liste">${icon("heart")}</button>
        </div>
        <p class="deck-hint">Touche la carte pour la fiche · glisse ↓ si déjà vu ou lu</p>
      </div>`;

    view.querySelector(".chips").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-kind]");
      if (!chip || chip.dataset.kind === Store.state.kindFilter) return;
      Store.state.kindFilter = chip.dataset.kind;
      Store.save();
      renderDiscover();
    });

    document.getElementById("act-nope").addEventListener("click", () => swipeTop(-1));
    document.getElementById("act-like").addEventListener("click", () => swipeTop(1));
    document.getElementById("act-super").addEventListener("click", () => swipeTop(2));
    document.getElementById("act-undo").addEventListener("click", undoSwipe);
    document.getElementById("act-seen").addEventListener("click", () => markSeen());

    renderStack();

    if (!Store.state.onboarded) showOnboarding();
  }

  function renderStack() {
    const deck = document.getElementById("deck");
    if (!deck) return;
    const next = deckState.queue.slice(0, 3);
    if (!next.length) {
      deck.innerHTML = `
        <div class="deck-empty">
          ${icon("compass")}
          <h2>Tout vu pour l'instant !</h2>
          <p>Tu as parcouru tout le catalogue ${Store.state.kindFilter === "tout" ? "" : `des ${KIND_PLURAL[Store.state.kindFilter].toLowerCase()} `}dans cette catégorie. Retrouve tes découvertes dans « Mes listes ».</p>
          <button class="btn btn-primary" id="deck-reset-filter">${icon("flame")} Tout explorer</button>
        </div>`;
      document.getElementById("deck-reset-filter")?.addEventListener("click", () => {
        Store.state.kindFilter = "tout";
        Store.save();
        renderDiscover();
      });
      updateDeckButtons(false);
      return;
    }
    deck.innerHTML = "";
    next.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.zIndex = String(3 - i);
      card.dataset.id = item.id;
      card.innerHTML = posterCard(item, i === 0 && Reco.isStrongMatch(item.id, deckState.info));
      if (i === 0) {
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `${item.t} — toucher pour la fiche détaillée`);
      }
      deck.appendChild(card);
    });
    attachDrag(deck.firstElementChild);
    updateDeckButtons(true);
  }

  function updateDeckButtons(hasCards) {
    for (const id of ["act-nope", "act-like", "act-super", "act-seen"]) {
      const b = document.getElementById(id);
      if (b) b.disabled = !hasCards;
    }
    const undo = document.getElementById("act-undo");
    if (undo) undo.disabled = !deckState.history.length;
  }

  /* Geste de swipe (pointer events) */
  function attachDrag(card) {
    if (!card) return;
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, maxMove = 0;

    const stamps = {
      like: card.querySelector(".stamp-like"),
      nope: card.querySelector(".stamp-nope"),
      super: card.querySelector(".stamp-super"),
      seen: card.querySelector(".stamp-seen"),
    };

    card.addEventListener("click", () => {
      if (maxMove > 8 || deckState.busy) return;
      if (deckState.queue[0]) openSheet(deckState.queue[0]);
    });
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && deckState.queue[0]) {
        e.preventDefault();
        openSheet(deckState.queue[0]);
      }
    });

    card.addEventListener("pointerdown", (e) => {
      if (deckState.busy || e.button > 0) return;
      dragging = true;
      maxMove = 0;
      startX = e.clientX;
      startY = e.clientY;
      card.setPointerCapture(e.pointerId);
      card.classList.add("dragging");
    });

    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      maxMove = Math.max(maxMove, Math.hypot(dx, dy));
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.045}deg)`;
      const isSuper = dy < -70 && Math.abs(dx) < 60;
      const isSeen = dy > 70 && Math.abs(dx) < 60;
      stamps.like.style.opacity = isSuper || isSeen ? 0 : Math.min(1, Math.max(0, dx / 80));
      stamps.nope.style.opacity = isSuper || isSeen ? 0 : Math.min(1, Math.max(0, -dx / 80));
      stamps.super.style.opacity = Math.min(1, Math.max(0, isSuper ? -dy / 130 : 0));
      stamps.seen.style.opacity = Math.min(1, Math.max(0, isSeen ? dy / 130 : 0));
    });

    const release = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("dragging");
      const th = Math.min(window.innerWidth * 0.28, 130);
      const isSuper = dy < -th * 1.1 && Math.abs(dx) < 70;
      const isSeen = dy > th * 1.1 && Math.abs(dx) < 70;
      if (isSuper) swipeTop(2, card);
      else if (isSeen) markSeen(card);
      else if (dx > th) swipeTop(1, card);
      else if (dx < -th) swipeTop(-1, card);
      else {
        card.style.transform = "";
        for (const s of Object.values(stamps)) s.style.opacity = 0;
      }
      dx = dy = 0;
    };
    card.addEventListener("pointerup", release);
    card.addEventListener("pointercancel", release);
  }

  function swipeTop(value, cardEl) {
    const item = deckState.queue[0];
    if (!item || deckState.busy) return;
    deckState.busy = true;
    haptic(value === 2 ? 24 : 12);

    Store.swipe(item.id, value);
    deckState.history.push({ item });
    deckState.queue.shift();

    const strong = value > 0 && Reco.isStrongMatch(item.id, deckState.info);
    if (value === 2) toast(`« ${item.t} » ajouté à tes favoris`, { match: true });
    else if (strong) toast(`Ça matche ! « ${item.t} » est dans ta liste`, { match: true });
    else if (value === 1) announce(`${item.t} ajouté à ta liste À découvrir`);
    else announce(`${item.t} passé`);

    const deck = document.getElementById("deck");
    const card = cardEl || deck?.firstElementChild;
    const finish = () => {
      deckState.busy = false;
      renderStack();
    };
    if (!card || reducedMotion.matches) { finish(); return; }

    const stamp = card.querySelector(value === 2 ? ".stamp-super" : value === 1 ? ".stamp-like" : ".stamp-nope");
    if (stamp) stamp.style.opacity = 1;
    card.style.transform = "";
    card.classList.add(value === 2 ? "fly-up" : value === 1 ? "fly-right" : "fly-left");
    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    card.addEventListener("transitionend", once, { once: true });
    setTimeout(once, 380);
  }

  function undoSwipe() {
    const entry = deckState.history.pop();
    if (!entry) return;
    const item = entry.item;
    haptic();
    if (entry.seen) {
      Store.removeFrom("done", item.id);
      delete Store.state.swipes[item.id];
      Store.save();
    } else {
      Store.unswipe(item.id);
    }
    deckState.queue.unshift(item);
    toast(`Annulé : « ${item.t} »`);
    renderStack();
  }

  /* Déjà vu / lu : alimente les recommandations, avec feedback optionnel */
  function markSeen(cardEl) {
    const item = deckState.queue[0];
    if (!item || deckState.busy) return;
    deckState.busy = true;
    haptic(16);
    Store.addTo("done", item.id);
    deckState.history.push({ item, seen: true });
    deckState.queue.shift();

    const deck = document.getElementById("deck");
    const card = cardEl || deck?.firstElementChild;
    const finish = () => {
      deckState.busy = false;
      renderStack();
      feedbackToast(item);
    };
    if (!card || reducedMotion.matches) { finish(); return; }
    const stamp = card.querySelector(".stamp-seen");
    if (stamp) stamp.style.opacity = 1;
    card.style.transform = "";
    card.classList.add("fly-down");
    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    card.addEventListener("transitionend", once, { once: true });
    setTimeout(once, 380);
  }

  function feedbackToast(item) {
    document.querySelector(".toast")?.remove();
    clearTimeout(toastTimer);
    const t = document.createElement("div");
    t.className = "toast ask";
    t.innerHTML = `${icon("eye")}<span>Tu as aimé « ${esc(item.t)} » ?</span>
      <button class="toast-btn yes">Oui !</button>
      <button class="toast-btn no">Pas trop</button>`;
    t.querySelector(".yes").addEventListener("click", () => {
      Store.rate(item.id, 2);
      t.remove();
      toast("Noté ! Tes recos s'affinent", { match: true });
    });
    t.querySelector(".no").addEventListener("click", () => {
      Store.rate(item.id, -1);
      t.remove();
      toast("Noté, on évitera ce style");
    });
    document.body.appendChild(t);
    announce(`${item.t} marqué comme ${item.k === "livre" ? "lu" : "vu"}`);
    toastTimer = setTimeout(() => {
      t.classList.add("hide");
      setTimeout(() => t.remove(), 250);
    }, 7000);
  }

  /* Clavier : flèches sur la vue Découvrir */
  document.addEventListener("keydown", (e) => {
    if (routes.current !== "decouvrir" || sheetEl) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    if (e.key === "ArrowRight") swipeTop(1);
    else if (e.key === "ArrowLeft") swipeTop(-1);
    else if (e.key === "ArrowUp") { e.preventDefault(); swipeTop(2); }
    else if (e.key === "ArrowDown") { e.preventDefault(); markSeen(); }
  });

  function showOnboarding() {
    const ob = document.createElement("div");
    ob.className = "onboarding";
    ob.innerHTML = `
      <div class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <h2 id="ob-title">Bienvenue sur Kult</h2>
        <p>Swipe films, séries et livres : plus tu swipes, plus les recommandations te ressemblent.</p>
        <div class="onboarding-tips">
          <div class="tip"><span class="tip-icon like">${icon("heart")}</span><span>Glisse à <strong>droite</strong> pour ajouter à ta liste « À découvrir »</span></div>
          <div class="tip"><span class="tip-icon nope">${icon("x")}</span><span>Glisse à <strong>gauche</strong> pour passer</span></div>
          <div class="tip"><span class="tip-icon super">${icon("star")}</span><span>Glisse vers le <strong>haut</strong> pour un coup de cœur</span></div>
          <div class="tip"><span class="tip-icon seen">${icon("eye")}</span><span>Glisse vers le <strong>bas</strong> si tu l'as <strong>déjà vu ou lu</strong> — tes recos en tiennent compte</span></div>
        </div>
        <button class="btn btn-primary" id="ob-go">C'est parti</button>
      </div>`;
    overlays.appendChild(ob);
    document.getElementById("ob-go").addEventListener("click", () => {
      Store.state.onboarded = true;
      Store.save();
      ob.remove();
      view.focus();
    });
    document.getElementById("ob-go").focus();
  }

  /* ── Vue : Recherche ─────────────────────────────── */

  const searchState = { q: "", kind: "tout", genre: "", minRating: 0 };

  function renderSearch() {
    view.innerHTML = `
      <header class="app-header"><h1 class="logo">Kult</h1></header>
      <h2 class="view-title">Recherche</h2>
      <div class="search-bar">
        ${icon("search")}
        <input id="search-input" type="search" inputmode="search" autocomplete="off"
          placeholder="Titre, auteur, réalisateur…" aria-label="Rechercher un film, une série ou un livre"
          value="${esc(searchState.q)}" />
        <button class="search-clear" id="search-clear" aria-label="Effacer la recherche" ${searchState.q ? "" : "hidden"}>${icon("x")}</button>
      </div>
      <div class="filters-row">
        <div class="select-wrap">
          <select id="f-kind" aria-label="Filtrer par type">
            <option value="tout">Tous types</option>
            <option value="film">Films</option>
            <option value="serie">Séries</option>
            <option value="livre">Livres</option>
          </select>
        </div>
        <div class="select-wrap">
          <select id="f-genre" aria-label="Filtrer par genre">
            <option value="">Tous genres</option>
            ${GENRES.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("")}
          </select>
        </div>
        <div class="select-wrap">
          <select id="f-rating" aria-label="Filtrer par note minimale">
            <option value="0">Toutes notes</option>
            <option value="8">8+ ${"★"}</option>
            <option value="8.5">8,5+ ${"★"}</option>
            <option value="9">9+ ${"★"}</option>
          </select>
        </div>
      </div>
      <div id="search-results"></div>`;

    const input = document.getElementById("search-input");
    const clear = document.getElementById("search-clear");
    const fKind = document.getElementById("f-kind");
    const fGenre = document.getElementById("f-genre");
    const fRating = document.getElementById("f-rating");
    fKind.value = searchState.kind;
    fGenre.value = searchState.genre;
    fRating.value = String(searchState.minRating);

    let debounce = null;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        searchState.q = input.value;
        clear.hidden = !input.value;
        renderResults();
      }, 160);
    });
    clear.addEventListener("click", () => {
      input.value = "";
      searchState.q = "";
      clear.hidden = true;
      renderResults();
      input.focus();
    });
    for (const [sel, key] of [[fKind, "kind"], [fGenre, "genre"], [fRating, "minRating"]]) {
      sel.addEventListener("change", () => {
        searchState[key] = key === "minRating" ? Number(sel.value) : sel.value;
        sel.classList.toggle("active", sel.value !== "" && sel.value !== "tout" && sel.value !== "0");
        renderResults();
      });
      sel.classList.toggle("active", sel.value !== "" && sel.value !== "tout" && sel.value !== "0");
    }

    renderResults();
  }

  function searchResults() {
    const q = normalize(searchState.q.trim());
    return CATALOG.filter((x) => {
      if (searchState.kind !== "tout" && x.k !== searchState.kind) return false;
      if (searchState.genre && !x.g.includes(searchState.genre)) return false;
      if (x.r < searchState.minRating) return false;
      if (!q) return true;
      return normalize(`${x.t} ${x.c} ${x.g.join(" ")}`).includes(q);
    }).sort((a, b) => b.r - a.r);
  }

  function renderResults() {
    const box = document.getElementById("search-results");
    if (!box) return;
    const hasQuery = searchState.q.trim() || searchState.genre || searchState.kind !== "tout" || searchState.minRating > 0;

    if (!hasQuery) {
      const sug = Reco.suggestions(9);
      box.innerHTML = `
        <p class="section-label">Pour toi</p>
        <div class="grid">${sug.map(miniCard).join("")}</div>`;
      return;
    }

    const results = searchResults();
    if (!results.length) {
      box.innerHTML = `
        <div class="empty-state">
          ${icon("search")}
          <h2>Aucun résultat</h2>
          <p>Essaie un autre titre, ou élargis les filtres.</p>
          <button class="btn btn-ghost" id="reset-filters">Réinitialiser les filtres</button>
        </div>`;
      document.getElementById("reset-filters").addEventListener("click", () => {
        Object.assign(searchState, { q: "", kind: "tout", genre: "", minRating: 0 });
        renderSearch();
        document.getElementById("search-input").focus();
      });
      return;
    }
    box.innerHTML = `
      <p class="results-count">${results.length} résultat${results.length > 1 ? "s" : ""}</p>
      <div class="grid">${results.map(miniCard).join("")}</div>`;
  }

  /* ── Vue : Mes listes ────────────────────────────── */

  let listsTab = "todo";

  function renderLists() {
    view.innerHTML = `
      <header class="app-header"><h1 class="logo">Kult</h1></header>
      <h2 class="view-title">Mes listes</h2>
      <div class="segmented" role="group" aria-label="Choisir une liste">
        <button data-tab="todo" aria-pressed="${listsTab === "todo"}">À découvrir</button>
        <button data-tab="fav" aria-pressed="${listsTab === "fav"}">Favoris</button>
        <button data-tab="done" aria-pressed="${listsTab === "done"}">Vus · Lus</button>
      </div>
      <div id="list-rows"></div>`;

    view.querySelector(".segmented").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      listsTab = b.dataset.tab;
      view.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderListRows();
    });

    renderListRows();
    renderLists.refresh = renderListRows;
  }

  function renderListRows() {
    const box = document.getElementById("list-rows");
    if (!box) return;
    const ids = Store.state.lists[listsTab];
    const items = ids.map((id) => BY_ID[id]).filter(Boolean);

    if (!items.length) {
      const msgs = {
        todo: ["Rien à découvrir pour l'instant", "Swipe à droite dans « Découvrir » pour remplir ta liste."],
        fav: ["Pas encore de favoris", "Swipe vers le haut ou touche l'étoile sur une fiche pour marquer un coup de cœur."],
        done: ["Rien de vu ou lu pour l'instant", "Glisse une carte vers le bas dans « Découvrir », ou marque un titre depuis sa fiche."],
      };
      box.innerHTML = `
        <div class="empty-state">
          ${icon(listsTab === "fav" ? "star" : listsTab === "done" ? "check" : "bookmark")}
          <h2>${msgs[listsTab][0]}</h2>
          <p>${msgs[listsTab][1]}</p>
          <a class="btn btn-primary" href="#/decouvrir">${icon("flame")} Aller découvrir</a>
        </div>`;
      return;
    }

    box.innerHTML = `<div class="rows">${items.map((item) => {
      const fav = Store.inList("fav", item.id);
      const done = Store.inList("done", item.id);
      const doneLabel = item.k === "livre" ? "lu" : "vu";
      return `
        <div class="row" style="--h:${item.h}">
          <button class="row-poster" data-open="${item.id}" aria-label="Voir la fiche de ${esc(item.t)}" style="--h:${item.h}">
            ${icon(KIND_ICON[item.k])}
            <img class="poster-img" src="${imgSrc(item.id)}" alt="" loading="lazy" />
          </button>
          <button class="row-body" data-open="${item.id}">
            <p class="row-title">${esc(item.t)}</p>
            <p class="row-sub">${KIND_LABEL[item.k]} · ${item.y} · ${fmtRating(item.r)} ★</p>
          </button>
          <div class="row-actions">
            <button class="row-btn ${fav ? "is-on" : ""}" data-fav="${item.id}" aria-pressed="${fav}" aria-label="${fav ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("star")}</button>
            <button class="row-btn ${done ? "done-on" : ""}" data-done="${item.id}" aria-pressed="${done}" aria-label="Marquer comme ${doneLabel}">${icon("check")}</button>
            <button class="row-btn" data-remove="${item.id}" aria-label="Retirer de la liste">${icon("trash")}</button>
          </div>
        </div>`;
    }).join("")}</div>`;

    box.onclick = (e) => {
      const open = e.target.closest("[data-open]");
      if (open) { openSheet(BY_ID[open.dataset.open]); return; }
      const fav = e.target.closest("[data-fav]");
      const done = e.target.closest("[data-done]");
      const remove = e.target.closest("[data-remove]");
      if (fav) {
        const id = fav.dataset.fav;
        haptic();
        Store.inList("fav", id) ? Store.removeFrom("fav", id) : Store.addTo("fav", id);
        renderListRows();
      } else if (done) {
        const id = done.dataset.done;
        haptic();
        if (Store.inList("done", id)) Store.removeFrom("done", id);
        else {
          Store.addTo("done", id);
          toast(`« ${BY_ID[id].t} » marqué comme ${BY_ID[id].k === "livre" ? "lu" : "vu"}`);
        }
        renderListRows();
      } else if (remove) {
        haptic();
        Store.removeFrom(listsTab, remove.dataset.remove);
        toast("Retiré de la liste");
        renderListRows();
      }
    };
  }

  /* ── Vue : Profil ────────────────────────────────── */

  const KIND_COLORS = { film: "#8b5cf6", serie: "#ec4899", livre: "#fbbf24" };

  function renderProfile() {
    const p = Reco.profile();
    const swipeCount = Object.keys(Store.state.swipes).length;
    const likeCount = Object.values(Store.state.swipes).filter((v) => v > 0).length;

    const topGenres = Object.entries(p.genres)
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const genreTotal = topGenres.reduce((s, [, w]) => s + w, 0);

    const kindsPos = Object.entries(p.kinds).filter(([, w]) => w > 0);
    const kindTotal = kindsPos.reduce((s, [, w]) => s + w, 0);

    let summary = "Swipe encore quelques titres pour que je cerne tes goûts ! Astuce : glisse vers le bas les titres que tu as déjà vus ou lus, ils comptent aussi.";
    if (p.signals >= 3 && topGenres.length >= 2) {
      const bestKind = kindsPos.sort((a, b) => b[1] - a[1])[0]?.[0];
      summary = `Tu es plutôt <strong>${esc(topGenres[0][0])}</strong> et <strong>${esc(topGenres[1][0])}</strong>, team <strong>${KIND_PLURAL[bestKind]}</strong>. Tes swipes et tes titres vus ou lus ajustent tes recommandations en continu.`;
    }

    view.innerHTML = `
      <header class="app-header"><h1 class="logo">Kult</h1></header>
      <div class="profile-hero">
        <div class="avatar">${icon("user")}</div>
        <div>
          <h1>Ton profil de goûts</h1>
          <p>${p.signals} signal${p.signals > 1 ? "s" : ""} de goût enregistré${p.signals > 1 ? "s" : ""}</p>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-tile"><div class="stat-value">${swipeCount}</div><div class="stat-label">Swipes</div></div>
        <div class="stat-tile"><div class="stat-value">${likeCount}</div><div class="stat-label">Likes</div></div>
        <div class="stat-tile"><div class="stat-value">${Store.state.lists.fav.length}</div><div class="stat-label">Favoris</div></div>
        <div class="stat-tile"><div class="stat-value">${Store.state.lists.done.length}</div><div class="stat-label">Vus / Lus</div></div>
      </div>

      <p class="taste-summary">${summary}</p>

      ${topGenres.length ? `
        <p class="section-label">Tes genres préférés</p>
        <div class="bars">
          ${topGenres.map(([g, w]) => {
            const pct = Math.round((w / genreTotal) * 100);
            return `
              <div class="bar-item">
                <span class="bar-name">${esc(g)}</span>
                <div class="bar-track" role="img" aria-label="${esc(g)} : ${pct} % de tes goûts">
                  <div class="bar-fill" style="width:${pct}%"></div>
                </div>
                <span class="bar-value">${pct} %</span>
              </div>`;
          }).join("")}
        </div>` : ""}

      ${kindTotal ? `
        <p class="section-label">Ton mix films / séries / livres</p>
        <div class="kind-split" role="img" aria-label="${kindsPos.map(([k, w]) => `${KIND_PLURAL[k]} ${Math.round((w / kindTotal) * 100)} %`).join(", ")}">
          ${kindsPos.map(([k, w]) => `<span style="width:${(w / kindTotal) * 100}%;background:${KIND_COLORS[k]}"></span>`).join("")}
        </div>
        <div class="kind-legend">
          ${kindsPos.map(([k, w]) => `<span><span class="dot" style="background:${KIND_COLORS[k]}"></span>${KIND_PLURAL[k]} · ${Math.round((w / kindTotal) * 100)} %</span>`).join("")}
        </div>` : ""}

      <button class="btn btn-danger" id="reset-data">${icon("trash")} Réinitialiser mes données</button>`;

    document.getElementById("reset-data").addEventListener("click", () => {
      confirmDialog({
        title: "Tout réinitialiser ?",
        text: "Tes swipes, listes et ton profil de goûts seront définitivement effacés de cet appareil.",
        confirmLabel: "Tout effacer",
        onConfirm: () => {
          Store.reset();
          deckState.history.length = 0;
          toast("Données réinitialisées");
          renderProfile();
        },
      });
    });
  }

  /* ── Routing ─────────────────────────────────────── */

  const routes = {
    current: null,
    map: {
      decouvrir: renderDiscover,
      recherche: renderSearch,
      listes: renderLists,
      profil: renderProfile,
    },
  };

  function route() {
    const name = (location.hash.replace(/^#\/?/, "") || "decouvrir").split("/")[0];
    const render = routes.map[name] || renderDiscover;
    const target = routes.map[name] ? name : "decouvrir";
    if (routes.current === target) return;
    routes.current = target;
    closeSheet({ instant: true });
    render();
    document.querySelectorAll(".nav-item").forEach((a) => {
      if (a.dataset.route === target) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    view.focus({ preventScroll: true });
  }

  /* Ouverture de fiche depuis les grilles de recherche */
  view.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open && routes.current === "recherche") openSheet(BY_ID[open.dataset.open]);
  });

  window.addEventListener("hashchange", route);
  route();

  /* ── Service worker (hors-ligne) ─────────────────── */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
