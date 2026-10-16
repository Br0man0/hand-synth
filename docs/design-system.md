# Design system — Hand Synth

La caméra occupe tout l'écran. L'interface est faite d'éléments **en verre
dépoli** qui flottent par-dessus : une barre d'état, deux boutons ronds, un
dock et une feuille de réglages. L'inspiration vient du « liquid glass »
d'Apple, mais en **moins transparent**, pour que le texte reste lisible devant
une fenêtre ou un mur clair.

## Principes

1. **La vidéo d'abord.** Seuls les éléments flottants captent les clics
   (`.hud { pointer-events: none }`, réactivé sur ses enfants directs). Les
   réglages sont repliés par défaut.
2. **Une couleur par main.** Le cobalt correspond à la main gauche
   (déclencheur, vélocité), le jaune signal à la main droite (choix de la
   note). Ces couleurs servent aux squelettes, aux témoins, aux doigts, à la
   vélocité et aux états des degrés. Elles ne servent jamais à décorer.
3. **Un seul élément fort.** La note jouée s'affiche en très grand, en Archivo
   étendu, et la touche du degré qui sonne devient jaune pleine. Tout le reste
   reste sobre.

## Matériau verre (`.glass`)

| Couche | Valeur | Rôle |
|---|---|---|
| Teinte `--glass-tint` | `rgb(18 22 28 / 0.6)` | Assombrit l'arrière-plan : c'est elle qui garantit la lisibilité |
| Reflet `--glass-sheen` | dégradé blanc 11 % → 2 % sur le haut | Donne le reflet du verre |
| Flou `--glass-blur` | `blur(28px) saturate(170%)` | Dépoli, avec les couleurs de la pièce ravivées |
| Bord `--glass-edge` | blanc à 16 %, 1 px | Contour |
| Ombre `--glass-shadow` | liseré clair en haut, liseré sombre en bas, ombre portée 24/60 px | Épaisseur, détache l'élément de la vidéo |

Si le navigateur n'a pas `backdrop-filter`, la teinte passe à 88 %. Si
l'utilisateur a activé `prefers-reduced-transparency`, elle passe à 92 %.

**Lisibilité :** devant une vidéo de pièce typique, le fond effectif du verre
est entre `#202428` et `#4A4D50`. Le blanc y est à plus de 9:1 et `--ink-soft`
(blanc à 82 %) à plus de 6:1. Dans le pire cas (vidéo uniformément blanche),
le fond effectif est d'environ `#737373`, ce qui donne 4,7:1 pour le blanc et
3,8:1 pour `--ink-soft`. Dans ce cas, `prefers-reduced-transparency` ou une
teinte plus forte règlent le problème.

## Tokens

| Token | Valeur | Rôle |
|---|---|---|
| `--graphite` | `#1E2328` | Fond de page, texte sur les pastilles claires et sur le jaune |
| `--hand-left` | `#5C78FF` | Main gauche. Le cobalt est éclairci (l'ancien `#2F4BE0` était trop sombre sur le verre) |
| `--hand-right` | `#F2B705` | Main droite. Le graphite sur ce jaune donne 8,7:1 |
| `--alert` | `#B3202F` | Erreur, son coupé |
| `--ink` / `--ink-soft` / `--ink-faint` | blanc 100 / 82 / 50 % | Texte principal, secondaire, note pas encore jouée |
| `--key-fill` / `--key-edge` | blanc 7 % / 12 % | Touches et puces au repos (verre dans le verre) |
| `--pill` | blanc 92 % | Option choisie, bouton actif |
| `--track` | blanc 12 % | Rail des jauges |

**Typographie :** une seule famille, **Archivo** (variable, axes `wdth` et
`wght`). La largeur porte la hiérarchie : 125 pour la note, de 108 à 118 pour
les titres et les chiffres romains, 90 pour les libellés.

**Rayons :** ils sont concentriques. Le dock a 34 px et ses touches 22 px. La
feuille a 30 px et ses contrôles 14 px (segments intérieurs à 11 px). Les
boutons ronds sont des cercles.

**Marges :** `--edge` vaut 28 px sur ordinateur, 20 px sous 1180 px de large
et 14 px sous 760 px. L'espacement suit une échelle de 4 px.

**Mouvement :** 120 ms `cubic-bezier(.2,.7,.2,1)`, uniquement sur les
changements d'état. Tout est désactivé avec `prefers-reduced-motion`.

## Composants

### Barre d'état (`.status`)
C'est une pilule en verre en haut à gauche, avec le logo, le nom et un témoin
par main (`.led`). La pastille est vide quand la main est absente, pleine et
lumineuse quand elle est détectée. Chaque témoin a deux libellés : un long
(« Main gauche : poing fermé ») et un court pour le mobile (« Poing fermé »).

### Boutons ronds (`.round`)
Il y en a deux en haut à droite, en 52 px (44 px sur mobile).
- **Son** : `aria-pressed`. Quand le son est coupé, le bouton passe en rouge
  et l'icône change. Raccourci : touche M.
- **Réglages** : `aria-expanded`. Quand la feuille est ouverte, le bouton
  devient une pastille claire avec l'icône graphite.

### Feuille de réglages (`.sheet`)
C'est un panneau en verre de 384 px, sous les boutons. Sur mobile, il prend
toute la largeur. Il contient :
- **Tonalité** (`.chips`) : 12 puces en grille de 6 colonnes (des boutons
  radio natifs) ;
- **Gamme, octave, forme d'onde, effets** (`.seg`) : contrôles segmentés, avec
  le segment choisi en pastille claire.

On le ferme avec Échap, et le focus revient alors sur le bouton Réglages.

### Dock (`.dock`)
C'est le verre principal, centré en bas. Il contient trois zones :
1. **Lecture** (`.readout`) : la note en 68 px, puis le degré et la
   fréquence. L'état `armed` ou `idle` met la note en `--ink-faint` et affiche
   une consigne.
2. **Degrés** (`.degree`) : 7 touches de 84 × 96 px. Chacune porte le chiffre
   romain, la note et un **glyphe** de 5 barres qui montre les doigts à lever.
   - `data-selected` : contour jaune de 2 px et fond jaune à 14 %, avec un
     halo.
   - `data-playing` : touche jaune pleine, texte et glyphe graphite.
3. **Côté** (`.dock__side`) :
   - les témoins des doigts (`.fingers`), 5 barres qui dessinent une main,
     jaunes et lumineuses quand le doigt est tendu ;
   - la jauge de vélocité (`.meter`), cobalt et lumineuse.

Sur mobile, le dock passe en grille : la lecture et le côté sur une ligne,
puis les 7 degrés sur la ligne suivante (58 px de haut, sans glyphe).

### Écran d'accueil (`.gate`)
C'est une carte en verre sur le fond graphite, éclairé par deux lueurs aux
couleurs des mains. Le bouton Démarrer est une pilule jaune.

### Superposition vidéo
- Main droite : le squelette est jaune, avec un anneau sur le bout de chaque
  doigt tendu.
- Main gauche : le squelette est cobalt, avec un disque sur la paume, plein
  quand le poing est fermé et vide sinon.

## Accessibilité

- Les contrôles sont des boutons et des radios natifs. Le focus est indiqué
  par un contour blanc de 2 px.
- Les éléments qui ne sont que des icônes ont un `aria-label`.
- Les glyphes et les témoins des doigts ont `role="img"` et un libellé
  textuel.
- La jauge de vélocité porte `role="meter"`.
- Les changements de note ne sont pas annoncés (`aria-live="off"`), parce
  qu'il y en a trop. Seul le démarrage est annoncé.
- Les états ne passent jamais par la couleur seule : texte, remplissage et
  contour changent aussi.
