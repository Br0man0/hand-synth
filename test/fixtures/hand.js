// Main synthétique à 21 points, coordonnées caméra brutes.
// Sert aux tests unitaires et au test e2e (MediaPipe simulé).
//   fingers : { thumb, index, middle, ring, pinky } booléens (tendu ou non)
//   cx, cy  : position de la base du majeur ; s : taille de la main
//   tilt    : rotation de la main en radians autour du poignet
export function makeHand({ fingers = {}, cx = 0.5, cy = 0.5, s = 0.08, tilt = 0 } = {}) {
  const f = { thumb: false, index: false, middle: false, ring: false, pinky: false, ...fingers };
  const p = (dx, dy) => ({ x: cx + dx * s, y: cy + dy * s, z: 0 });
  const lm = new Array(21);
  lm[0] = p(0, 1.5);
  // Pouce : CMC, MCP, IP, bout
  lm[1] = p(-0.7, 1.1);
  lm[2] = p(-1.0, 0.8);
  lm[3] = p(-1.3, 0.5);
  lm[4] = f.thumb ? p(-1.6, 0.2) : p(-0.3, 0.4);
  // Doigts : MCP, PIP, DIP, bout
  const cols = { index: [-0.6, 0], middle: [-0.2, 0], ring: [0.2, 0], pinky: [0.6, 0.1] };
  const base = { index: 5, middle: 9, ring: 13, pinky: 17 };
  for (const [name, [dx, dy]] of Object.entries(cols)) {
    const i = base[name];
    lm[i] = p(dx, dy);
    if (f[name]) {
      lm[i + 1] = p(dx, dy - 0.5);
      lm[i + 2] = p(dx, dy - 0.8);
      lm[i + 3] = p(dx, dy - 1.1);
    } else {
      lm[i + 1] = p(dx, dy - 0.4);
      lm[i + 2] = p(dx, dy - 0.1);
      lm[i + 3] = p(dx, dy + 0.3);
    }
  }
  if (tilt) {
    const w = lm[0];
    const c = Math.cos(tilt);
    const sn = Math.sin(tilt);
    for (let i = 1; i < 21; i++) {
      const dx = lm[i].x - w.x;
      const dy = lm[i].y - w.y;
      lm[i] = { x: w.x + dx * c - dy * sn, y: w.y + dx * sn + dy * c, z: 0 };
    }
  }
  return lm;
}

/** Raccourci : liste de doigts tendus -> objet fingers. */
export const shape = (...names) => Object.fromEntries(names.map((n) => [n, true]));
