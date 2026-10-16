# Hand Synth

Un synthétiseur dont on joue avec les mains devant la webcam. Tout tourne dans
le navigateur : le suivi des mains par MediaPipe et le son par Web Audio. Aucun
serveur n'est nécessaire et la vidéo ne quitte pas l'appareil.

**Démo :** https://br0man0.github.io/hand-synth/

| Main | Geste | Effet |
|---|---|---|
| Droite | Monter / descendre | Hauteur de la note (A2 → A5) |
| Gauche | Monter / descendre | Volume |
| Gauche | Écarter le pouce et l'index | Ouverture du filtre (200 Hz → 8 kHz) |

Sans main gauche visible, le volume et le filtre restent à des valeurs par
défaut, ce qui permet de jouer à une main. La touche **M** coupe ou rétablit le son.

## Démarrage rapide

La caméra exige HTTPS ou `localhost`. Il faut donc servir les fichiers (un
`file://` ne fonctionne pas) :

```bash
npm start          # http://localhost:5173 (serve, sans dépendance installée)
# ou
python3 -m http.server 5173
```

Pour lancer les tests (Node ≥ 20, sans dépendance) :

```bash
npm test
```

## Architecture

```
index.html ── styles.css
   └─ src/main.js          boucle requestAnimationFrame, état, rendu de la façade
       ├─ src/vision.js    getUserMedia + MediaPipe HandLandmarker (GPU → CPU)
       ├─ src/mapping.js   fonctions pures : landmarks → fréquence, volume, filtre
       ├─ src/synth.js     Web Audio : osc + sub → passe-bas → gain → limiteur
       └─ src/overlay.js   squelettes des mains sur <canvas>
```

À chaque nouvelle image vidéo, `detectForVideo()` renvoie 21 points par main.
`assignHands()` répartit les mains selon leur **côté à l'écran** et non selon le
label de MediaPipe, qui suppose une image déjà miroir. `mapping.js` convertit
ensuite les points en paramètres, que `Synth.set()` applique avec
`setTargetAtTime` pour éviter les clics.

Les choix techniques sont expliqués dans
[`docs/adr/0001-stack-navigateur.md`](docs/adr/0001-stack-navigateur.md), et les
tokens et composants d'interface dans [`docs/design-system.md`](docs/design-system.md).

## Où modifier quoi

| Je veux… | Fichier |
|---|---|
| Changer la plage de notes ou la gamme | `PITCH` et `SCALES` dans `src/mapping.js` |
| Ajouter un geste (par exemple le nombre de doigts levés) | une fonction pure dans `src/mapping.js`, appelée dans `play()` de `src/main.js` |
| Modifier le son (enveloppe, effets, polyphonie) | `src/synth.js` |
| Brancher son propre modèle (ONNX) | remplacer ou compléter `createHandTracker()` dans `src/vision.js` |
| Changer couleurs et typo | variables `:root` de `styles.css` |

## Déploiement

Un `git push` sur `main` déclenche `.github/workflows/pages.yml`. Le workflow
lance les tests, puis publie `index.html`, `styles.css`, `favicon.svg` et `src/`
sur GitHub Pages. Dans les réglages du repo, *Settings → Pages → Source* doit
être sur **GitHub Actions**.

## Dépendances externes

- `@mediapipe/tasks-vision@0.10.35` (JS et WASM) via jsDelivr
- le modèle `hand_landmarker.task` (float16) via Google Storage
- la police Archivo via Google Fonts

Pour fonctionner hors ligne, il faut copier ces fichiers dans `vendor/` et
modifier les URL dans `src/vision.js`.
