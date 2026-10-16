# Design system — Hand Synth

L'interface reprend le langage d'un instrument hardware. On a une scène plein
écran (la vidéo miroir et les squelettes des mains) et, en bas, une **façade
en aluminium**. Elle porte la lecture de la note et les réglages.

## Principes

1. **Une couleur par main.** Le cobalt correspond à la main gauche (le
   déclencheur et la vélocité), le jaune signal à la main droite (le choix de
   la note). Chaque élément qui dépend d'une main utilise sa couleur : le
   squelette, la jauge de vélocité, les témoins des doigts, le liseré du degré
   choisi et le témoin de détection. Ces deux couleurs ne servent jamais à
   décorer.
2. **Un seul élément fort.** La note jouée s'affiche en très grand, en Archivo
   étendu. Tout le reste reste sobre.
3. **La façade est un panneau, pas une pile de cartes.** On a une seule
   surface, séparée en zones par des filets. On n'empile pas de cartes ombrées.

## Tokens

Ils sont définis dans `styles.css` sous `:root`.

| Token | Valeur | Rôle |
|---|---|---|
| `--alu` | `#C9CDD1` | Surface de la façade |
| `--alu-edge` | `#A9AEB3` | Filets et bords de la façade |
| `--graphite` | `#1E2328` | Texte, fond de scène |
| `--graphite-soft` | `#4A5158` | Texte secondaire (contraste 5:1 sur `--alu`) |
| `--hand-left` | `#2F4BE0` | Main gauche : déclencheur, vélocité |
| `--hand-right` | `#F2B705` | Main droite : choix de la note (sur fond graphite ou vidéo) |
| `--hand-right-ink` | `#6F5400` | Jaune profond pour les repères de la main droite sur l'alu (4,5:1) : liseré du degré choisi, contours |
| `--alert` | `#B3202F` | Erreurs |

**Typographie :** on utilise une seule famille, **Archivo** (variable, axes
`wdth` et `wght`). La largeur porte la hiérarchie.

| Token | Réglage | Usage |
|---|---|---|
| `--type-readout` | `wdth 125`, `wght 800`, `clamp(3rem, 9vw, 6.5rem)` | Note jouée |
| `--type-title` | `wdth 112`, `wght 700`, `2rem` | Titre de l'écran d'accueil |
| `--type-body` | `wdth 100`, `wght 400`, `1rem / 1.5` | Texte courant |
| `--type-label` | `wdth 88`, `wght 600`, `0.8125rem` | Libellés de contrôles (casse normale) |

**Espacement :** l'échelle est en multiples de 4 px. `--space-1` vaut 4 px,
`--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-6` 24 et
`--space-8` 32.

**Rayons :** `--radius-key` vaut 3 px (touches, segments) et `--radius-panel`
vaut 0 (la façade va d'un bord à l'autre).

**Mouvement :** `--ease-out` est `cubic-bezier(.2,.7,.2,1)` et `--dur-fast`
vaut 90 ms. Les transitions sont désactivées si l'utilisateur a activé
`prefers-reduced-motion`.

## Composants

### Guide des degrés (`.degrees` > `.degree`)
C'est une rangée de 7 touches, une par degré, sur toute la largeur de la
façade. Chacune affiche le chiffre romain, la note dans la tonalité courante
et le geste à faire. Le degré choisi par la main droite reçoit un liseré jaune
en bas (`--hand-right-ink`, `data-selected`). Le jaune signal seul n'atteint
que 1,1:1 sur l'alu. Le degré qui sonne apparaît comme une touche
enfoncée : fond graphite et texte alu (`data-playing`). Sur mobile, le geste
est masqué.

### Lecture de note (`.readout`)
Elle affiche le nom de la note (par exemple `E3`) en `--type-readout`, puis le
degré et la fréquence en `--type-label`. Il y a trois états, portés par
`data-state` sur `.readout__note` :
- `playing` : texte graphite, la note sonne ;
- `armed` : texte `--graphite-soft`, la note est choisie mais pas jouée, avec
  la consigne « ferme le poing gauche » ;
- `idle` : `—` et « Silence ».

Le conteneur porte `aria-live="off"`, parce qu'il change trop souvent pour un
lecteur d'écran.

### Témoins des doigts (`.fingers`)
Ce sont 5 barres de hauteurs différentes qui dessinent une main (pouce
court à gauche, majeur le plus haut). Une barre est jaune avec un contour
`--hand-right-ink` quand le doigt est tendu, et en creux alu sinon. L'élément porte
`role="img"` et un `aria-label` qui nomme les doigts tendus.

### Jauge (`.meter`)
Elle comprend un libellé, une barre et une valeur chiffrée. Le remplissage
utilise la couleur de la main qui pilote le paramètre. Elle porte
`role="meter"` avec `aria-valuemin`, `aria-valuemax` et `aria-valuenow`.

### Segments (`.segmented`)
C'est un groupe de boutons radio natifs habillés en touches (gamme, octave,
forme d'onde, effets). Ils se pilotent au clavier avec les flèches (comportement
natif des radios). L'état actif est représenté par le fond graphite et le
texte alu. Le focus est indiqué par un contour de 2 px en `--hand-left`
(4,1:1 sur l'alu), décalé de 2 px. Sur fond graphite (écran d'accueil), le
contour est blanc.

### Bouton (`.key`)
Il existe en deux variantes. `primary` (fond jaune signal, texte graphite à 8,7:1) sert à « Démarrer ».
`toggle` utilise `aria-pressed` et sert à « Couper le son ». Leur hauteur
minimale est de 44 px.

### Témoin de main (`.hand-led`)
C'est une pastille de la couleur de la main, pleine quand la main est
détectée et vide sinon. Elle est toujours accompagnée d'un texte, pour que
l'information ne passe pas que par la couleur.

### Liste déroulante (`.select`)
Elle sert à la tonalité. C'est un `<select>` natif avec le même habillage que
les touches. Sa hauteur minimale est de 44 px et son libellé est au-dessus.

### Réglages repliables (`.settings`)
C'est un `<details>` qui contient tous les réglages. Sur ordinateur, il est
toujours ouvert et son titre est masqué. Sous 560 px de large, il est replié
par défaut pour laisser la place à la vidéo, et son titre « Réglages » sert
de bouton.

### Superposition vidéo
- Main droite : le squelette est jaune, avec un anneau sur le bout de chaque
  doigt tendu.
- Main gauche : le squelette est cobalt, avec un disque sur la paume, plein
  quand le poing est fermé (la note est tenue) et vide sinon.
