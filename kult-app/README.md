# Kult 🎬📺📚

**Le Tinder des films, séries et livres.** Swipe, découvre, et laisse le moteur de
recommandation apprendre tes goûts.

Application web mobile-first (PWA) : installable sur l'écran d'accueil, fonctionne
hors-ligne, zéro dépendance, zéro build.

## Lancer l'application

```bash
cd kult-app
python3 -m http.server 8080
```

Puis ouvre **http://localhost:8080** (idéalement en mode responsive mobile, 375×812).

> Le service worker (mode hors-ligne) nécessite un serveur HTTP — ouvrir
> `index.html` directement en `file://` fonctionne, mais sans le hors-ligne.

### Installer sur téléphone

1. Sers l'app sur ton réseau (`python3 -m http.server 8080 --bind 0.0.0.0`) ou déploie
   le dossier sur n'importe quel hébergeur statique (Netlify, Vercel, GitHub Pages…).
2. Ouvre l'URL sur ton téléphone → menu du navigateur → **« Ajouter à l'écran d'accueil »**.

## Fonctionnalités

| Écran | Contenu |
|---|---|
| **Découvrir** | Deck de cartes façon Tinder avec vraies jaquettes : glisse à droite (à découvrir), à gauche (passer), vers le haut (coup de cœur), **vers le bas (déjà vu / déjà lu)**. Toucher la carte ouvre la fiche. Boutons équivalents + flèches clavier ← → ↑ ↓. Annulation du dernier swipe. Filtre Films / Séries / Livres. |
| **Recherche** | Recherche instantanée (titre, créateur·rice, genre, insensible aux accents), filtres type / genre / note minimale, suggestions « Pour toi » personnalisées. |
| **Mes listes** | À découvrir · Favoris · Vus/Lus, avec actions rapides sur chaque titre. |
| **Profil** | Profil de goûts : stats de swipe, genres préférés (barres), mix films/séries/livres, résumé en langage naturel. Réinitialisation avec confirmation. |

## Moteur de recommandation

Contenu-based, 100 % local (`js/engine.js`) :

- chaque like (+1), coup de cœur (+2) ou passe (−0,6) pondère les **genres**, le
  **type** (film/série/livre) et les **créateur·rice·s** de l'élément ;
- les titres marqués **déjà vus / déjà lus** comptent comme goûts positifs, et le
  mini-feedback « Tu as aimé ? » (Oui ! / Pas trop) renforce ou inverse ce signal ;
- le score d'un titre = qualité de base (note publique) + affinité genres + affinité
  type + affinité créateur·rice ;
- le deck est trié par score avec **1 carte sur 4 tirée en exploration** pour éviter
  la bulle de filtre ;
- un like sur un titre du top 20 % des scores déclenche un « Ça matche ! ».

Toutes les données restent sur l'appareil (`localStorage`), aucun compte, aucun tracker.

## Design system

Généré avec [UI/UX Pro Max](../README.md) — thème clair vibrant :

- **Couleurs** : fond lavande clair `#faf7fc` avec halos colorés, accent dégradé
  violet → rose (`#7c3aed → #ec4899`), sémantiques like/passe/coup de cœur/déjà vu,
  contrastes AA vérifiés ;
- **Typo** : Poppins (400–800), corps 16 px, chiffres tabulaires pour les stats ;
- **Mouvement** : micro-interactions 150–300 ms, easing sortant, `prefers-reduced-motion`
  respecté ;
- **Accessibilité** : cibles tactiles ≥ 44 px, focus visibles, `aria-live` pour les
  actions, labels sur toutes les icônes, navigation clavier complète ;
- **Mobile** : safe areas (`env(safe-area-inset-*)`), `100dvh`, `touch-action`,
  jaquettes optimisées (JPEG 320 px, ~20 Ko) avec affiche générative CSS en
  placeholder/fallback, `loading="lazy"` sur les grilles.

## Jaquettes

Les 102 jaquettes sont téléchargées et optimisées par un script à partir de
sources ouvertes : **Wikipédia** (affiches de films), **TVmaze** (séries) et
**Open Library** (couvertures de livres). Les visuels restent la propriété de
leurs ayants droit — usage de démonstration uniquement. Si une image manque,
l'app affiche automatiquement son affiche générative colorée.

## Structure

```
kult-app/
├── index.html            # Shell + sprite d'icônes SVG (Lucide)
├── css/styles.css        # Design tokens + composants
├── js/
│   ├── data.js           # Catalogue de démo (102 titres FR)
│   ├── engine.js         # Persistance localStorage + moteur de reco
│   └── app.js            # Routing, deck de swipe, vues
├── img/                  # 102 jaquettes optimisées (JPEG 320 px)
├── sw.js                 # Service worker (hors-ligne)
├── manifest.webmanifest  # Manifest PWA
└── icons/                # Icônes SVG (standard + maskable)
```

## Brancher des données réelles (piste d'évolution)

Le catalogue est un simple tableau `CATALOG` dans `js/data.js`. Pour passer aux
données réelles : remplacer ce tableau par des appels [TMDB](https://developer.themoviedb.org)
(films/séries) et [Google Books](https://developers.google.com/books) en conservant le
même format d'objet — le moteur de reco et l'UI fonctionneront sans changement.
