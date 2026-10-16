# Paramètres

[← Retour au README](../README.md) · [Installation](installation.md) · [Fonctionnement](fonctionnement.md) · [Dépannage](depannage.md)

Il y a deux niveaux de réglage :

1. **[Dans l'interface](#1-dans-linterface)** : sans toucher au code, pendant
   qu'on joue.
2. **[Dans le code](#2-dans-le-code)** : des constantes regroupées en haut des
   fichiers. Après une modification, recharge la page. Il n'y a rien à
   compiler.

Les noms renvoient aux constantes du code. Recherche-les avec `Ctrl+F` ou
`grep` : les numéros de ligne changent, les noms restent.

---

## 1. Dans l'interface

Le bouton **Réglages**, en haut à droite, ouvre la fenêtre de réglages. On la
ferme avec Échap.

| Réglage | Choix | Par défaut | Effet |
|---|---|---|---|
| Tonalité | C, C#, D … B | C | Tonique de la gamme : les 7 degrés sont recalculés |
| Gamme | Majeur, Mineur | Majeur | Mineur = mineur naturel (éolien) |
| Octave | 2, 3, 4, 5 | 3 | Octave du degré I (C3 = 131 Hz, C4 = 262 Hz) |
| Forme d'onde | Dent de scie, Carré, Triangle | Dent de scie | Forme des 3 oscillateurs de l'unisson (le sous-oscillateur reste sinusoïdal) |
| Effets | Sec, Réverb, Réverb et delay | Réverb | Préréglages d'envoi vers la réverb et le delay |
| Son | Bouton haut-parleur ou touche **M** | Activé | Coupe ou rétablit le son, sans arrêter le jeu |

Les valeurs par défaut sont les options cochées (`checked`) dans
`index.html`. Pour la tonalité, c'est `pc === 0` dans la boucle qui crée les
puces, dans `src/main.js`.

---

## 2. Dans le code

### 2.1 Son : `PATCH` (`src/synth.js`)

| Clé | Défaut | Unité | Effet | Plage conseillée |
|---|---|---|---|---|
| `detuneCents` | `10` | cents | Écart des deux dents de scie extérieures (±). Plus haut = plus large et plus « chorus ». | 0 (son fin) – 25 (très large) |
| `subLevel` | `0.2` | gain | Niveau du sinus une octave plus bas (corps, basses) | 0 – 0.5 |
| `voiceLevel` | `0.22` | gain | Niveau de chaque dent de scie. Le baisser si la somme sature. | 0.15 – 0.3 |
| `amp.attack` | `0.015` | s | Montée de l'enveloppe de volume | 0.005 (claquant) – 0.3 (nappe) |
| `amp.decay` | `0.25` | s | Descente du pic vers le sustain | 0.05 – 1 |
| `amp.sustain` | `0.65` | 0..1 | Niveau tenu, en fraction du pic | 0 (pluck pur) – 1 (orgue) |
| `amp.release` | `0.3` | s | Extinction après le relâchement du poing | 0.05 – 2 |
| `filter.q` | `1.1` | Q | Résonance du passe-bas. Au-delà de 3, ça siffle. | 0.7 – 3 |
| `filter.attack` | `0.008` | s | Ouverture du filtre à l'attaque | 0.002 – 0.1 |
| `filter.decay` | `0.35` | s | Fermeture du filtre (longueur du « pluck ») | 0.1 (sec) – 1.5 (lent) |
| `filter.envAmount` | `5500` | Hz | Ouverture maximale au-dessus de la base, × vélocité | 0 (pas de pluck) – 9000 |
| `filter.sustainAmount` | `900` | Hz | Ouverture tenue au-dessus de la base, × vélocité | 0 – 4000 |
| `glide` | `0.004` | s | Constante de temps du glissement de hauteur entre notes | 0.002 – 0.08 (portamento audible) |
| `masterGain` | `0.75` | gain | Volume général, avant le limiteur | 0.3 – 1 |
| `drive.maxGain` | `30` | × | Gain avant la saturation à distorsion maximale (×1 + maxGain) | 5 (léger) – 60 (fuzz) |
| `drive.wetLevel` | `0.45` | gain | Niveau du signal saturé. Le baisser si la distorsion monte trop le volume. | 0.3 – 0.7 |
| `drive.tone` | `5000` | Hz | Passe-bas après la saturation (adoucit l'aigu) | 2000 (sombre) – 12000 (agressif) |
| `expression.floorDb` | `-30` | dB | Volume quand la main gauche est en bas de la zone | −50 (grande plage) – −12 (plage réduite) |
| `expression.smooth` | `0.04` | s | Lissage audio du volume | 0.01 – 0.15 |
| `reverb.seconds` | `2.4` | s | Longueur de la réverb (réponse générée au démarrage) | 0.8 (pièce) – 5 (cathédrale) |
| `reverb.send` | `0.25` | gain | Quantité de réverb quand elle est activée | 0.1 – 0.6 |
| `delay.time` | `0.32` | s | Temps entre deux répétitions | 0.1 – 1 |
| `delay.feedback` | `0.32` | 0..1 | Nombre de répétitions. **Rester sous 0,9**, sinon le delay s'emballe. | 0 – 0.7 |
| `delay.send` | `0.18` | gain | Quantité de delay quand il est activé | 0.05 – 0.4 |
| `delay.damping` | `2500` | Hz | Passe-bas dans la boucle : chaque répétition est plus sombre | 1000 – 8000 |

**Préréglages d'effets : `EFFECTS`** (`src/synth.js`). Ce sont des
multiplicateurs (0 ou 1) appliqués à `reverb.send` et `delay.send`. Pour
ajouter un préréglage, ajoute une entrée, puis un bouton radio
`name="fx" value="<clé>"` dans `index.html` :

```js
export const EFFECTS = {
  dry: { reverb: 0, delay: 0 },
  reverb: { reverb: 1, delay: 0 },
  space: { reverb: 1, delay: 1 },
  echo: { reverb: 0, delay: 1 }, // exemple : delay seul
};
```

**Valeurs écrites en dur** dans `synth.js`, à modifier au besoin :

| Où | Valeur | Rôle |
|---|---|---|
| `noteOn` → `peak` | `0.85` | Pic de l'enveloppe de volume. Le volume réel vient de la main gauche. |
| `#filterBase()` | `250 + 0.8 × fréquence` | Coupure de base du filtre, qui suit la note |
| `makeDriveCurve(n, k)` | `k = 3` | Dureté de la courbe `tanh` (1 = douce, 10 = presque écrêtage) |
| Limiteur (`DynamicsCompressorNode`) | seuil −6 dB, ratio 20 | Protège les oreilles et les enceintes. À garder. |

### 2.2 Réactivité du jeu : `TIMING` (`src/performer.js`)

| Clé | Défaut | Effet | Conseil |
|---|---|---|---|
| `degreeHoldMs` | `90` ms | Durée pendant laquelle une forme de main droite doit rester stable avant de changer de note | Monter à 120–150 si des notes parasites apparaissent en changeant de doigts. Descendre à 60 pour un jeu plus nerveux. |
| `leftGraceMs` | `500` ms | Tolérance si la main gauche disparaît, avant de relâcher la note et de passer en jeu à une main | Monter si la note se coupe quand tu bouges vite. Descendre si le relâchement en retirant la main paraît lent. |

Autres valeurs dans `performer.js` :

| Nom | Défaut | Effet |
|---|---|---|
| `AUTO_LEVEL` | `0.8` | Volume et vélocité en jeu à une main |
| `createSmoother(0.35)` (volume) | α = 0.35 | Lissage du volume de la main gauche. Plus bas = plus doux mais plus lent. |
| `createSmoother(0.3)` (distorsion) | α = 0.3 | Lissage de la distorsion du poignet droit |

### 2.3 Gestes et détection : `src/mapping.js`

**Distorsion : `DRIVE`**

| Clé | Défaut | Effet |
|---|---|---|
| `deadZone` | `15`° | Rotation en dessous de laquelle il n'y a pas de distorsion |
| `fullAt` | `60`° | Rotation à laquelle la distorsion est maximale |

Pour une distorsion **dans un seul sens** (par exemple seulement en tournant
vers l'extérieur), remplace `Math.abs(deg)` par `deg` ou `-deg` dans
`driveFromRoll`.

**Gammes : `SCALES`**

```js
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], // exemple d'ajout
};
```

Une gamme doit avoir **exactement 7 notes**, une par degré. Ajoute ensuite
le bouton radio `name="scale" value="dorian"` dans `index.html`.

**Formes de main : `degreeFromFingers()`**

C'est ici qu'on change quel geste donne quel degré, par exemple pour libérer
le pouce. Pense à mettre à jour l'aide visuelle des touches, `DEGREE_SHAPES`
dans `src/main.js`, pour qu'elle montre les bons doigts.

**Seuils de détection** (valeurs écrites en dur) :

| Fonction | Valeur | Rôle | Si ça marche mal |
|---|---|---|---|
| `fingerStates` → `ext()` | `× 1.1` | Un doigt est tendu si son bout est 10 % plus loin du poignet que son articulation | Doigts tendus non vus : 1.05. Doigts repliés vus comme tendus : 1.15. |
| `fingerStates` → `thumb` | `× 0.9` | Pouce tendu si son bout est loin de la base du majeur (en largeurs de paume) | Pouce non vu : 0.8. Pouce replié vu comme tendu : 1.0. |
| `createFistDetector` | fermé à 0 doigt, ouvert à ≥ 2 | Hystérésis du poing | Passer l'ouverture à ≥ 3 pour un poing plus « collant » |
| `velocityFromHeight`, `volumeFromHeight` | zone `0.15` → `0.85` | Partie de l'image (en hauteur) utilisée pour le volume | Réduire la zone (0.25 → 0.75) pour atteindre les extrêmes avec moins d'amplitude |
| `velocityFromHeight` | `0.25 + 0.75 ×` | Brillance minimale de l'attaque en bas de la zone | — |

### 2.4 Vision : `src/vision.js`

| Nom | Défaut | Effet |
|---|---|---|
| `MP_VERSION` | `"0.10.35"` | Version de MediaPipe Tasks Vision. Change aussi le WASM chargé. |
| `MODEL_URL` | `hand_landmarker.task` float16 | Modèle de points de la main |
| `getUserMedia` → `width` / `height` | 1280 × 720 (idéal) | Résolution demandée. 640 × 480 soulage les machines faibles, au prix d'un peu de précision à distance. |
| `numHands` | `2` | Nombre de mains suivies |
| `minHandDetectionConfidence` | `0.6` | Confiance minimale pour détecter une nouvelle main. Plus bas = détecte plus loin ou dans le noir, mais plus de faux positifs. |
| `minHandPresenceConfidence` | `0.6` | Confiance pour garder une main déjà suivie |
| `minTrackingConfidence` | `0.5` | Seuil sous lequel MediaPipe relance une détection complète |
| `delegate` | `"GPU"` puis `"CPU"` | Accélération. Le repli CPU est automatique. |

### 2.5 Application : `src/main.js`

| Nom | Défaut | Effet |
|---|---|---|
| `state.key` | `{ root: 0, scale: major, octave: 3 }` | Tonalité initiale. Elle est remplacée au chargement par les options cochées de `index.html`, c'est donc **là** qu'il faut changer les valeurs par défaut. |
| `sendIfMoved` | seuil `0.005` | Variation minimale du volume ou de la distorsion pour envoyer une nouvelle valeur à l'audio |
| `DEGREE_SHAPES` | — | Doigts dessinés sur chaque touche de degré (aide visuelle) |
| `ERRORS` | — | Messages d'erreur affichés à l'accueil |

### 2.6 Apparence : `styles.css` (`:root`)

| Token | Défaut | Effet |
|---|---|---|
| `--glass-tint` | `rgb(18 22 28 / 0.6)` | **Opacité du verre.** 0.45 = plus transparent (moins lisible devant une fenêtre). 0.75 = plus opaque. |
| `--glass-blur` | `blur(28px) saturate(170%)` | Force du dépoli et intensité des couleurs derrière le verre |
| `--glass-sheen` | dégradé blanc 11 % → 2 % | Reflet en haut des éléments en verre |
| `--hand-left` | `#5C78FF` | Couleur de la main gauche (squelette, témoin, jauge de volume) |
| `--hand-right` | `#F2B705` | Couleur de la main droite (squelette, doigts, degrés, distorsion) |
| `--edge` | `28px` (20 puis 14 px sur petits écrans) | Marge entre les bords de l'écran et les éléments flottants |
| `--r-dock`, `--r-sheet`, `--r-key` | 34, 30, 22 px | Arrondis (concentriques) |
| Media queries | `1180px`, `760px` | Passage au dock compact, puis à la mise en page mobile |

Le détail des composants est dans le [design system](design-system.md).

---

## 3. Recettes

**Un son de nappe (pad) plutôt que de pluck**

```js
amp: { attack: 0.4, decay: 0.8, sustain: 0.9, release: 1.5 },
filter: { q: 0.9, attack: 0.3, decay: 1.2, envAmount: 2000, sustainAmount: 1500 },
detuneCents: 18,
```

**Un lead plus agressif**

```js
filter: { q: 2.5, attack: 0.004, decay: 0.2, envAmount: 8000, sustainAmount: 600 },
drive: { maxGain: 50, wetLevel: 0.5, tone: 8000 },
```

**Un portamento audible entre les notes** : `glide: 0.05`.

**Un volume qui ne descend jamais au silence** : `expression.floorDb: -15`.

**Jouer plus grave par défaut** : coche `value="2"` au lieu de `value="3"`
dans le groupe `name="octave"` de `index.html`.

**Changements de note plus réactifs** : `TIMING.degreeHoldMs: 60`. C'est plus
nerveux, mais une forme de passage peut parfois sonner.

Après chaque modification, lance `npm test`. Les tests couvrent la détection,
les degrés et la logique de jeu. Le son, lui, se vérifie à l'oreille.
