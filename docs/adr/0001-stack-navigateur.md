# ADR-0001 : Tracking et synthèse 100 % navigateur, hébergement statique

**Statut :** Accepté
**Date :** 2026-10-16
**Décideur :** Mathieu

## Contexte

On veut un synthétiseur web dont on joue avec les mains devant la webcam. Il doit
être accessible par une simple URL. Les contraintes sont les suivantes :

- **Latence** : un instrument devient injouable au-delà de ~50 ms entre le geste
  et le son.
- **Coût** : pas de serveur à payer, et le site doit tenir sur GitHub Pages.
- **Vie privée** : la vidéo des utilisateurs ne doit pas quitter leur machine.
- **Simplicité** : un squelette qu'on peut lire en entier et faire évoluer
  sans chaîne de build.

## Décision

1. **Tracking** : MediaPipe Tasks Vision `HandLandmarker` (v0.10.35), chargé en
   module ES depuis jsDelivr. Il tourne en mode `VIDEO` avec 2 mains, sur le GPU
   avec repli sur le CPU. Le modèle `.task` est servi par Google Storage.
2. **Synthèse** : Web Audio API native. La chaîne est oscillateurs → filtre
   passe-bas → gain → sortie, et les paramètres sont lissés avec
   `setTargetAtTime`.
3. **Hébergement** : site statique (HTML, CSS et modules ES), sans bundler,
   déployé par GitHub Actions sur GitHub Pages.

## Options étudiées

### A. Tout dans le navigateur (retenue)
| Dimension | Évaluation |
|---|---|
| Complexité | Faible |
| Coût | Nul (Pages) |
| Latence | ~15–35 ms (inférence locale et audio local) |
| Passage à l'échelle | Illimité, le calcul est chez l'utilisateur |

**Pour :** latence minimale, aucune donnée vidéo transmise, déploiement trivial.
**Contre :** la performance dépend de la machine de l'utilisateur, et on est
limité aux modèles portés sur le web.

### B. Backend Python (FastAPI + WebRTC/WebSocket)
| Dimension | Évaluation |
|---|---|
| Complexité | Élevée (signalisation, serveur GPU) |
| Coût | Serveur GPU, coût proportionnel au nombre d'utilisateurs |
| Latence | +50–150 ms d'aller-retour réseau |
| Passage à l'échelle | Une session d'inférence par utilisateur |

**Pour :** on réutilise tel quel du code Python ou de gros modèles.
**Contre :** latence perceptible, coût, et la vidéo transite sur le serveur (RGPD).

### C. Modèle maison exporté en ONNX (onnxruntime-web)
| Dimension | Évaluation |
|---|---|
| Complexité | Moyenne (export, pré/post-traitement en JS) |
| Coût | Nul |
| Latence | Bonne si le modèle est petit (WebGPU) |

**Pour :** permet d'utiliser son propre modèle tout en restant côté client.
**Contre :** il faut réécrire tout le pipeline, ce qui est inutile pour une V1.

## Arbitrage

C'est la latence qui décide pour un instrument : B est éliminé pour un site
public. C est une **évolution** de A plutôt qu'une alternative. On pourra
brancher un classifieur ONNX sur les landmarks MediaPipe (21×3 points), ce qui
coûte très peu, sans toucher au reste de l'architecture.

## Conséquences

- Plus simple : déploiement par `git push`, aucun secret, aucune infrastructure.
- Plus difficile : on dépend de deux CDN (jsDelivr pour le JS/WASM, Google
  Storage pour le modèle). On pourra les héberger dans `vendor/` si besoin.
- À revoir : enveloppes ADSR et polyphonie, et un classifieur de gestes en
  ONNX quand les heuristiques géométriques ne suffiront plus.

## Actions

1. [x] Squelette : caméra, tracking, mapping et audio
2. [ ] Héberger le modèle et le WASM localement si les CDN posent problème
3. [ ] Expérimenter un classifieur de gestes en ONNX sur les landmarks
