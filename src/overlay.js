// Dessin des squelettes de main sur un <canvas> superposé à la vidéo.
// Le canvas a la taille native de la vidéo et le même object-fit + miroir CSS,
// donc on dessine directement en coordonnées caméra.

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };

export function createOverlay(canvas, colors) {
  const ctx = canvas.getContext("2d");

  function resize(w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  const px = (p) => [p.x * canvas.width, p.y * canvas.height];
  const unit = () => Math.max(2, canvas.width / 320);

  function skeleton(lm, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = unit();
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(...px(lm[a]));
      ctx.lineTo(...px(lm[b]));
    }
    ctx.stroke();
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(...px(p), unit() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function ring(p, radius, color, filled) {
    ctx.beginPath();
    ctx.arc(...px(p), radius, 0, Math.PI * 2);
    ctx.lineWidth = unit();
    ctx.strokeStyle = color;
    if (filled) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
  }

  /**
   * Distorsion : arc autour du poignet entre la verticale et l'axe de la main,
   * d'autant plus opaque que la distorsion est forte.
   */
  function rollGauge(lm, amount, color) {
    const [wx, wy] = px(lm[0]);
    const [mx, my] = px(lm[9]);
    const r = Math.hypot(mx - wx, my - wy) * 0.75;
    const up = -Math.PI / 2;
    const axis = Math.atan2(my - wy, mx - wx);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * amount;
    ctx.strokeStyle = color;
    ctx.lineWidth = unit() * 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(wx, wy, r, Math.min(up, axis), Math.max(up, axis));
    ctx.stroke();
    ctx.setLineDash([unit() * 2, unit() * 3]);
    ctx.lineWidth = unit();
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx, wy - r * 1.15);
    ctx.stroke();
    ctx.restore();
  }

  return {
    resize,
    /** frame : état renvoyé par le performer (doigts tendus, poing fermé). */
    draw({ left, right }, frame) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (right) {
        skeleton(right, colors.right);
        if (frame.drive > 0.01) rollGauge(right, frame.drive, colors.right);
        // Bouts des doigts tendus : ce sont eux qui choisissent la note.
        for (const [name, i] of Object.entries(TIPS)) {
          if (frame.rightFingers?.[name]) ring(right[i], unit() * 5, colors.right, false);
        }
      }
      if (left) {
        skeleton(left, colors.left);
        // Paume : disque plein quand le poing est fermé (note tenue).
        ring(left[9], unit() * 14, colors.left, frame.leftClosed);
      }
    },
  };
}
