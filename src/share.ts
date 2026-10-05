// The share card: a picture of a run (score, the week's level, rank and league)
// drawn on a canvas, sent through the phone's share sheet where there is one,
// otherwise saved as a picture.

export interface ShareCard {
  score: string;
  heading: string; // "weekly level · 5 oct"
  lines: string[]; // rank, league, best
  sky: string; // css colours from the current palette
  text: string;
}

const W = 1080;
const H = 1350;

function draw(c: ShareCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, c.sky);
  grad.addColorStop(1, c.text);
  g.fillStyle = c.sky;
  g.fillRect(0, 0, W, H);
  // A horizon band and a few lane lines, in the game's flat style.
  g.globalAlpha = 0.14;
  g.fillStyle = grad;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  g.globalAlpha = 0.22;
  g.strokeStyle = c.text;
  g.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    g.beginPath();
    g.moveTo(W / 2 + i * 18, H * 0.62);
    g.lineTo(W / 2 + i * 260, H);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = c.text;
  g.textAlign = 'center';
  const font = (px: number, weight = 400) => `${weight} ${px}px "JetBrains Mono", ui-monospace, monospace`;
  g.font = font(64, 300);
  g.fillText('E N D L E S S', W / 2, 190);
  g.font = font(28, 500);
  g.fillText('S  P  A  C  E', W / 2, 245);
  g.font = font(34);
  g.globalAlpha = 0.75;
  g.fillText(c.heading, W / 2, 420);
  g.globalAlpha = 1;
  g.font = font(180, 300);
  g.fillText(c.score, W / 2, 610);
  g.font = font(36);
  c.lines.forEach((l, i) => g.fillText(l, W / 2, 720 + i * 58));
  g.font = font(28);
  g.globalAlpha = 0.7;
  g.fillText('tomblack9452.github.io/endless', W / 2, H - 70);
  return canvas;
}

/** Share the card, or save it if the device can't share pictures. */
export async function shareCard(c: ShareCard): Promise<void> {
  const canvas = draw(c);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'endless-space.png', { type: 'image/png' });
  const data = { files: [file], title: 'Endless Space', text: `${c.score} on ${c.heading}` };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return;
    } catch {
      // Cancelled, or not allowed: fall through to saving it.
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'endless-space.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
