# Hand Synth

Un synthétiseur dont on joue avec les mains devant la webcam. La main droite
choisit la note avec les doigts, la main gauche la joue en fermant le poing.
Tout tourne dans le navigateur : MediaPipe pour le suivi des mains, Web Audio
pour le son. Il n'y a pas de serveur et la vidéo ne quitte pas l'appareil.

**Démo :** https://br0man0.github.io/hand-synth/

## Jouer

| Main droite (choix de la note) | Effet |
|---|---|
| 1, 2, 3, 4 ou 5 doigts tendus | Degrés I, II, III, IV, V |
| Index et auriculaire | VI |
| Index, auriculaire et pouce | VII |
| Tourner le poignet (comme un bouton), dans un sens ou dans l'autre | Distorsion : rien jusqu'à 15°, maximum à 60° |

| Main gauche (déclencheur) | Effet |
|---|---|
| Fermer le poing | Joue la note choisie |
| Ouvrir la main | Relâche la note |
| Monter ou descendre la main, poing fermé | Volume, en continu pendant que la note sonne |
| Hauteur de la main au moment de fermer | Brillance de l'attaque |
| Changer de doigts à droite, poing fermé | Joue la nouvelle note sans relâcher |

**Sans main gauche visible**, chaque changement de doigts joue la note et le
poing droit la relâche. La touche **M** coupe ou rétablit le son.

La caméra occupe tout l'écran. L'interface flotte par-dessus en verre
dépoli : une barre d'état, un dock avec la note, les 7 degrés (chacun montre
les doigts à lever), les doigts détectés, le volume et la distorsion. Le bouton Réglages,
en haut à droite, ouvre la tonalité, la gamme (majeure ou mineure), l'octave
(2 à 5), la forme d'onde et les effets (sec, réverb, ou réverb et delay).

## Le son

```
3 × dent de scie (−10, 0, +10 cents, panoramiques −0.5 / 0 / +0.5) + sinus à l'octave inférieure
  → passe-bas (Q 1.1) avec enveloppe : ouvre en 8 ms, se referme en ~350 ms (« pluck »)
  → distorsion (mélange sec / saturation tanh, pilotée par le poignet droit)
  → VCA avec ADSR : A 15 ms, D 250 ms, S 65 %, R 300 ms
  → volume continu (main gauche, de −30 dB à 0 dB)
  → sec + réverb (Convolver, réponse impulsionnelle générée de 2,4 s) + delay 320 ms (réinjection filtrée)
  → limiteur
```

Tous les réglages sont dans l'objet `PATCH` de `src/synth.js`.

## Démarrage rapide

La caméra exige HTTPS ou `localhost`, il faut donc servir les fichiers :

```bash
npm start          # http://localhost:5173
# ou
python3 -m http.server 5173
```

Pour lancer les tests (Node ≥ 22, sans dépendance) :

```bash
npm test
```

## Architecture

```
index.html ── styles.css
   └─ src/main.js          boucle requestAnimationFrame, rendu de la façade, réglages
       ├─ src/vision.js    getUserMedia + MediaPipe HandLandmarker (GPU, sinon CPU)
       ├─ src/performer.js mains -> événements note on / note off (sans DOM, testé)
       ├─ src/mapping.js   fonctions pures : doigts, degrés, gamme, stabilisateur, poing
       ├─ src/synth.js     moteur Web Audio (unisson, ADSR, filtre, réverb, delay)
       └─ src/overlay.js   squelettes des mains sur <canvas>
```

Les décisions sont documentées dans
[ADR-0001 (stack navigateur)](docs/adr/0001-stack-navigateur.md) et
[ADR-0002 (doigts et poing)](docs/adr/0002-doigts-et-poing.md). Le matériau verre,
les tokens et les composants d'interface sont décrits dans
[`docs/design-system.md`](docs/design-system.md).

## Où modifier quoi

| Je veux… | Fichier |
|---|---|
| Changer les formes de main associées aux degrés | `degreeFromFingers()` dans `src/mapping.js` |
| Régler la réactivité (délai de stabilisation, tolérance) | `TIMING` dans `src/performer.js` |
| Régler la plage de rotation de la distorsion | `DRIVE` dans `src/mapping.js` |
| Modifier le son (enveloppes, désaccord, effets) | `PATCH` dans `src/synth.js` |
| Ajouter une gamme | `SCALES` dans `src/mapping.js`, plus une option dans `index.html` |
| Brancher son propre modèle (ONNX) | `createHandTracker()` dans `src/vision.js` |
| Rendre le verre plus ou moins transparent | `--glass-tint` dans `styles.css` |

## Déploiement

Un `git push` sur `main` lance les tests puis publie le site sur GitHub Pages
(`.github/workflows/pages.yml`).

## Dépendances externes

- `@mediapipe/tasks-vision@0.10.35` (JS et WASM) via jsDelivr
- le modèle `hand_landmarker.task` (float16) via Google Storage
- la police Archivo via Google Fonts
