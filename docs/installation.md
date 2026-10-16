# Installation

[← Retour au README](../README.md) · [Fonctionnement](fonctionnement.md) · [Paramètres](parametres.md) · [Dépannage](depannage.md)

Hand Synth est un site statique : quelques fichiers HTML, CSS et JavaScript,
sans étape de build. « Installer » consiste donc à servir le dossier avec
n'importe quel serveur web local.

## Prérequis

| Élément | Requis pour | Remarques |
|---|---|---|
| Navigateur récent | Jouer | **Chrome ou Edge recommandés.** Firefox et Safari récents devraient fonctionner mais n'ont pas été testés. |
| Webcam | Jouer | 720p suffit. Une bonne lumière compte plus que la résolution. |
| Connexion Internet | Premier chargement | MediaPipe (JS, WASM), le modèle et la police viennent de CDN. Voir [Mode hors ligne](#mode-hors-ligne). |
| Node.js ≥ 22 | `npm start`, `npm test` | Optionnel pour jouer : Python suffit pour servir les fichiers. |
| Git | Cloner | Ou télécharge le ZIP depuis GitHub (*Code → Download ZIP*). |

## Lancer en local

```bash
git clone https://github.com/Br0man0/hand-synth.git
cd hand-synth
npm start
```

Ouvre ensuite **http://localhost:5173**, clique sur **Démarrer** et autorise
la caméra.

`npm start` lance [`serve`](https://www.npmjs.com/package/serve) via `npx`
(téléchargé au premier lancement, rien n'est ajouté au projet). Sans Node.js :

```bash
python3 -m http.server 5173
```

### Pourquoi un serveur, et pas un double-clic sur `index.html` ?

Deux contraintes du navigateur l'imposent :

1. Les **modules ES** (`<script type="module">`) sont bloqués quand la page
   est ouverte en `file://`.
2. La **caméra** (`getUserMedia`) n'est autorisée que dans un *contexte
   sécurisé* : HTTPS, ou `http://localhost`.

## Jouer depuis un téléphone ou une tablette

Sur le réseau local, `http://192.168.x.x:5173` **n'est pas** un contexte
sécurisé : la page s'ouvre, mais la caméra est refusée. Trois solutions :

**1. Utiliser la version en ligne** (le plus simple) :
https://br0man0.github.io/hand-synth/

**2. Servir en HTTPS avec un certificat local**, avec
[mkcert](https://github.com/FiloSottile/mkcert) :

```bash
# Une seule fois : crée une autorité de certification locale de confiance
mkcert -install

# Certificat pour ta machine (remplace par ton IP locale)
mkcert -cert-file cert.pem -key-file key.pem localhost 192.168.1.42

# Lancer en HTTPS
npx --yes serve@14.2.4 -l 5173 --ssl-cert cert.pem --ssl-key key.pem .
```

Ouvre ensuite `https://192.168.1.42:5173` sur le téléphone. Pour que le
téléphone fasse confiance au certificat, installe-lui l'autorité de mkcert
(`mkcert -CAROOT` indique où elle se trouve), sinon accepte l'avertissement de
sécurité. Ne committe pas `cert.pem` ni `key.pem`.

**3. Passer par un tunnel HTTPS** (`cloudflared tunnel --url
http://localhost:5173`, ngrok…) qui fournit une URL `https://` publique
temporaire.

## Lancer les tests

```bash
npm test
```

Ce sont 28 tests `node:test`, sans dépendance et sans navigateur :

| Fichier | Ce qui est testé |
|---|---|
| `test/mapping.test.js` | Détection des doigts (y compris main inclinée à ±60°), degrés I–VII, gammes, stabilisateur, poing avec hystérésis, rotation et distorsion, volume, répartition gauche/droite |
| `test/performer.test.js` | Scénarios de jeu complets : appui et relâche, changement de note sous le poing, volume qui suit la main en glissant, perte temporaire de la main gauche, jeu à une main |

Les tests utilisent des mains synthétiques à 21 points
(`test/fixtures/hand.js`), qu'on peut placer, ouvrir, fermer et incliner à
volonté.

## Déployer ta propre copie sur GitHub Pages

1. **Fork** le dépôt, ou pousse-le dans un nouveau dépôt **public** (GitHub
   Pages est gratuit pour les dépôts publics).
2. Va dans **Settings → Pages → Build and deployment → Source** et choisis
   **GitHub Actions**.
3. Pousse sur `main`. Le workflow `.github/workflows/pages.yml` :
   - lance `npm test` ;
   - si les tests passent, publie `index.html`, `styles.css`, `favicon.svg` et
     `src/` (les tests et la doc ne sont pas publiés).
4. Le site est disponible sur `https://<ton-compte>.github.io/<dépôt>/`.

Tous les chemins du site sont relatifs, donc il fonctionne dans un
sous-dossier sans configuration. N'importe quel hébergeur statique fait aussi
l'affaire (Netlify, Vercel, Cloudflare Pages, un bucket S3 ou GCS avec
CloudFront ou Cloud CDN…), à condition qu'il serve en HTTPS.

## Mode hors ligne

Par défaut, trois ressources viennent de l'extérieur :

| Ressource | Source | Où la changer |
|---|---|---|
| `@mediapipe/tasks-vision` 0.10.35 (JS et WASM) | jsDelivr | `MP_BASE` dans `src/vision.js` |
| Modèle `hand_landmarker.task` (float16) | Google Storage | `MODEL_URL` dans `src/vision.js` |
| Police Archivo | Google Fonts | `<link>` dans `index.html` |

Pour tout servir depuis le projet (hors ligne, intranet, ou pour ne pas
dépendre des CDN) :

```bash
mkdir -p vendor/mediapipe && cd vendor/mediapipe
npm pack @mediapipe/tasks-vision@0.10.35 && tar xzf mediapipe-tasks-vision-0.10.35.tgz
mv package/vision_bundle.mjs package/wasm . && rm -rf package *.tgz
curl -LO https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
cd ../..
```

Puis, dans `src/vision.js` :

```js
const MP_BASE = new URL("../vendor/mediapipe", import.meta.url).href;
const MODEL_URL = new URL("../vendor/mediapipe/hand_landmarker.task", import.meta.url).href;
```

Pour la police, télécharge Archivo (variable, axes `wdth` et `wght`),
déclare-la en `@font-face` dans `styles.css` et retire le `<link>` Google
Fonts. Pense aussi à ajouter `vendor` à la ligne `cp` du workflow si tu
déploies cette version.

## Structure du projet

```
hand-synth/
├── index.html              Page unique : vidéo, canvas, accueil, interface en verre
├── styles.css              Matériau verre, tokens, mise en page (desktop / mobile)
├── favicon.svg
├── src/
│   ├── main.js             Point d'entrée : démarrage, boucle d'image, rendu, réglages
│   ├── vision.js           Caméra + MediaPipe HandLandmarker
│   ├── mapping.js          Fonctions pures : doigts, degrés, gammes, rotation, poing, lissage
│   ├── performer.js        Logique de jeu : mains → note on/off, volume, distorsion
│   ├── synth.js            Moteur Web Audio
│   └── overlay.js          Dessin des squelettes sur <canvas>
├── test/                   Tests node:test + mains synthétiques
├── docs/                   Cette documentation, ADR, design system, captures
├── .github/workflows/      CI : tests + déploiement Pages
└── package.json            Scripts start / test (aucune dépendance)
```
