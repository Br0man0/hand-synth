# Design system — Hand Synth

L'interface reprend le langage d'un instrument hardware. On a une scène plein
écran (la vidéo miroir et les squelettes des mains) et, en bas, une **façade
en aluminium**. Elle porte la lecture de la note et les réglages.

## Principes

1. **Une couleur par main.** Le cobalt correspond à la main gauche (volume et
   filtre), le jaune signal à la main droite (hauteur). Chaque élément qui
   dépend d'une main utilise sa couleur : le squelette, les jauges, le curseur
   du rail et le témoin de détection. Ces deux couleurs ne servent jamais à
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
| `--hand-left` | `#2F4BE0` | Main gauche : volume et filtre |
| `--hand-right` | `#F2B705` | Main droite : hauteur |
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

### Lecture de note (`.readout`)
Elle affiche le nom de la note (par exemple `A4`) en `--type-readout`, puis la
fréquence et l'écart en cents en `--type-label`. Le conteneur porte
`aria-live="off"`, parce qu'il change trop souvent pour un lecteur d'écran.
L'état « aucune main » est affiché via `—` et le mot « Silence ».

### Jauge (`.meter`)
Elle comprend un libellé, une barre et une valeur chiffrée. Le remplissage
utilise la couleur de la main qui pilote le paramètre. Elle porte
`role="meter"` avec `aria-valuemin`, `aria-valuemax` et `aria-valuenow`.

### Segments (`.segmented`)
C'est un groupe de boutons radio natifs habillés en touches (forme d'onde,
mode de hauteur). Ils se pilotent au clavier avec les flèches (comportement
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

### Rail de hauteur (`.rail`)
Il est placé sur le bord droit de la scène. Il porte des graduations aux notes
jouables, positionnées sur la zone vidéo réellement affichée (calcul
`object-fit: cover`), et un curseur jaune qui suit la main droite.
