# ADR-0002 : Notes par les doigts (R3), déclenchement par le poing gauche (D)

**Statut :** Accepté (remplace le mapping thérémine de la v0.1)
**Date :** 2026-10-16
**Décideur :** Mathieu

## Contexte

En v0.1, la hauteur de la main droite donnait la note et la main gauche
réglait le volume et le filtre. Deux problèmes en résultaient :

1. **Hauteur instable.** Le tracking varie de 1 à 3 % d'une image à l'autre,
   ce qui produit un vibrato parasite, ou des allers-retours entre deux notes
   quand la main est à la limite.
2. **Son « oscillateur ».** Il n'y avait ni note-on ni note-off, donc aucune
   enveloppe possible, et le son restait un bourdon continu.

## Décision

- **Main droite, option R3** : la forme de la main donne un degré de la gamme.
  1 à 5 doigts tendus donnent I à V, index et auriculaire donnent VI, et avec
  le pouce en plus, VII.
- **Main gauche, architecture D** : fermer le poing envoie un note-on, l'ouvrir
  un note-off. La hauteur de la main au moment de l'appui donne la vélocité.
  Changer de doigts pendant que le poing est fermé rejoue une note sans la
  relâcher.
- **Jeu à une main** : si la main gauche est absente depuis plus de 200 ms,
  chaque changement de degré stable joue la note et le poing droit la relâche.

## Options écartées

| Option | Pourquoi |
|---|---|
| R1 (comptage seul, 5 notes) | Il manque VI et VII pour jouer une gamme complète |
| R2 (comptage + hauteur = octave) | La hauteur de la main redevient une source d'instabilité |
| A (main gauche = qualité d'accord) | Demande un moteur polyphonique ; prévu plus tard |
| B, E (main gauche = expression continue) | Sans déclencheur, le comptage joue les formes intermédiaires |

## Robustesse

- **Détection des doigts** : on compare les distances au poignet, pas les `y`
  (`tip.y < pip.y`), donc elle reste fiable quand la main est inclinée à ±45°
  (testé). Le pouce est jugé par la distance de son bout à la base du majeur,
  rapportée à la largeur de la paume.
- **Stabilisation** : une forme doit être tenue 90 ms avant d'être validée.
  Passer de 1 à 4 doigts traverse 2 et 3, qui ne doivent pas être joués.
- **Poing avec hystérésis** : il est fermé quand aucun des 4 doigts (pouce
  exclu) n'est tendu, et ouvert à partir de 2. Avec un seul doigt tendu, l'état
  précédent est conservé.
- **Tolérance de 200 ms** si la main gauche disparaît, pour qu'une image ratée
  ne coupe pas la note.
- **Arrivée poing fermé** : si la main gauche entre dans l'image déjà fermée,
  rien ne se joue avant un vrai appui (ouvrir puis fermer).

## Conséquences

- La logique de jeu est dans `src/performer.js`, sans DOM ni audio, et testée
  par des séquences de mains synthétiques (`test/performer.test.js`).
- La latence ajoutée vaut 90 ms au changement de note (stabilisateur). Le
  poing n'en ajoute pas.
- À revoir : rendre le délai de stabilisation réglable, et ajouter A
  (accords) avec un moteur polyphonique.

## Révision du 2026-10-16 : volume continu et distorsion

**Problème.** Le volume n'était lu qu'au moment où le poing se fermait, donc
monter ou descendre la main pendant la note ne changeait rien. En plus, un
geste rapide faisait perdre la main gauche plus de 200 ms. L'appli basculait
alors en jeu à une main, coupait la note, et rejouait aussitôt celle de la
main droite.

**Décision.**
- **Volume** : tant que le poing gauche est fermé, la hauteur de la main règle
  le volume en continu, lissé et appliqué après l'enveloppe, de −30 dB à
  0 dB. La hauteur au moment de l'appui ne règle plus que la brillance de
  l'attaque.
- **Tolérance** : elle passe de 200 à 500 ms. Après une perte réelle de la
  main gauche, le mode une main ne rejoue pas d'office la note déjà formée par
  la main droite : il faut changer de doigts.
- **Poing fermé avant la note** : la note part dès que la main droite la
  choisit, sans avoir à rouvrir le poing.
- **Distorsion** : c'est la rotation de la main droite dans le plan de
  l'image, mesurée sur l'axe poignet → base du majeur, dans un sens ou dans
  l'autre. Il y a une zone morte de 15°, et le maximum est atteint à 60°. La
  détection des doigts compare des distances, donc elle ne dépend pas de cette
  rotation (testé à ±60°). Le signal est mélangé à puissance constante entre
  sec et saturation `tanh`, avec un gain d'entrée jusqu'à ×31 et un passe-bas
  à 5 kHz après la saturation.

On a écarté la rotation « poignée de porte » (pronation, paume qui se
détourne de la caméra) : les doigts se superposent à l'image et la détection
du degré devient instable.
