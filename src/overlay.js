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

export function createOverlay(canvas, colors) {
  const ctx = canvas.getContext("2d");

  function resize(w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function drawHand(lm, color, highlight) {
    const { width: W, height: H } = canvas;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, W / 320);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, ctx.lineWidth * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Point de contrôle mis en évidence (anneau plus large).
    for (const i of highlight) {
      ctx.beginPath();
      ctx.lineWidth = Math.max(2, W / 400);
      ctx.arc(lm[i].x * W, lm[i].y * H, ctx.lineWidth * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  return {
    resize,
    draw({ left, right }) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (left) drawHand(left, colors.left, [4, 8]); // pincement -> filtre
      if (right) drawHand(right, colors.right, [9]); // paume -> hauteur
    },
  };
}
