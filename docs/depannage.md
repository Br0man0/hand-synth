# Dépannage

[← Retour au README](../README.md) · [Installation](installation.md) · [Fonctionnement](fonctionnement.md) · [Paramètres](parametres.md)

En cas de souci, ouvre d'abord la console du navigateur (F12 → Console) : les
erreurs de démarrage y sont détaillées.

## Démarrage et caméra

| Symptôme | Cause probable | Solution |
|---|---|---|
| « La caméra ne fonctionne qu'en HTTPS ou sur localhost » | Page ouverte en `http://` via une IP locale, ou en `file://` | Utilise `http://localhost:5173`, la [version en ligne](https://br0man0.github.io/hand-synth/) ou [HTTPS en local](installation.md#jouer-depuis-un-téléphone-ou-une-tablette) |
| « L'accès à la caméra a été refusé » | Permission refusée, une fois ou de façon permanente | Clique sur l'icône de cadenas ou de caméra dans la barre d'adresse → Autoriser, puis recharge la page. Sur macOS, vérifie aussi **Réglages Système → Confidentialité → Caméra** pour ton navigateur. |
| « Aucune caméra n'a été trouvée » | Pas de webcam, ou webcam désactivée | Branche ou active la webcam, puis clique sur Réessayer |
| « La caméra n'a pas pu démarrer » | Webcam utilisée par une autre application (visio, OBS…) | Ferme l'autre application, puis clique sur Réessayer |
| « Le modèle de suivi des mains n'a pas pu se charger » | Pas d'accès à jsDelivr ou à Google Storage (hors ligne, proxy, bloqueur) | Vérifie la connexion, ou passe en [mode hors ligne](installation.md#mode-hors-ligne) |
| Page blanche, erreur de module dans la console | Page ouverte en double-cliquant sur `index.html` | Sers le dossier (`npm start`) |
| Retour à l'accueil avec « La caméra s'est arrêtée » | Webcam débranchée ou mise en veille | Rebranche-la, puis clique sur Réessayer |

## Détection des mains

| Symptôme | Solution |
|---|---|
| Aucune main détectée | Éclaire tes mains (la lumière de face est la meilleure, évite le contre-jour d'une fenêtre). Tiens-toi à 50 cm – 1,5 m, paumes vers la caméra, mains entièrement dans l'image. |
| Les mains sont inversées | La répartition se fait selon le **côté de l'écran** : garde la main droite dans la moitié droite de l'image, et la gauche dans la moitié gauche. |
| Des notes parasites en changeant de doigts | Change de forme franchement. Si ça persiste, monte `TIMING.degreeHoldMs` (120–150). Voir [Paramètres](parametres.md#22-réactivité-du-jeu--timing-srcperformerjs). |
| Le pouce n'est pas reconnu (V ou VII impossibles) | Écarte bien le pouce sur le côté. Sinon, baisse le seuil du pouce dans `fingerStates` (`0.9` → `0.8`). |
| Des doigts repliés sont vus comme tendus | Replie-les plus franchement, ou monte le seuil `ext()` (`1.1` → `1.15`). |
| Le poing ne déclenche pas | Ferme tous les doigts sauf le pouce. Le témoin « Main gauche : poing fermé » et le disque plein sur la paume confirment que le poing est vu. |
| La note se coupe quand je bouge vite la main gauche | Le flou de bougé fait perdre la main. Monte `TIMING.leftGraceMs`, et améliore l'éclairage (le temps de pose de la webcam baisse quand il y a plus de lumière). |
| La distorsion se déclenche toute seule | Tiens la main droite plus verticale, ou monte `DRIVE.deadZone` (15° → 20–25°). |

## Son

| Symptôme | Solution |
|---|---|
| Aucun son | 1) Le bouton haut-parleur est-il rouge ? Appuie sur **M**. 2) Le volume dépend de la **hauteur de la main gauche** : en bas de l'image, c'est presque le silence. 3) Pour jouer, il faut une note choisie à droite **et** un poing fermé à gauche. Le dock doit afficher la note en blanc et la touche du degré en jaune plein. 4) Vérifie le volume système et la sortie audio. |
| Le son ne s'arrête pas | Ouvre la main gauche, ou montre le poing droit en jeu à une main. Changer d'onglet relâche aussi la note. |
| Craquements ou coupures | La machine est trop chargée : ferme les autres onglets, branche le portable sur secteur, baisse la résolution caméra (`vision.js`), et vérifie que MediaPipe utilise le GPU (pas d'avertissement « CPU » dans la console). |
| Trop fort ou saturé avec la distorsion | Baisse `PATCH.drive.wetLevel` (0.45 → 0.35) ou `PATCH.masterGain`. |
| Latence perçue | Le poing est le déclencheur le plus rapide : choisis la note avant de frapper. Un casque filaire évite la latence Bluetooth (souvent plus de 150 ms). |

## Affichage

| Symptôme | Solution |
|---|---|
| Le verre est peu lisible devant une fenêtre claire | Monte `--glass-tint` dans `styles.css` (0.6 → 0.75), ou active « Réduire la transparence » dans les réglages d'accessibilité du système. |
| Le verre est opaque (pas de flou) | Le navigateur ne gère pas `backdrop-filter`, ou la transparence réduite est activée : c'est le repli prévu. |
| L'image est inversée | C'est voulu : la vidéo est en miroir pour que ta main droite apparaisse à droite. |

## Signaler un problème

Ouvre une *issue* sur le dépôt avec : le navigateur et sa version, le système,
le message affiché, et les erreurs de la console (F12).
