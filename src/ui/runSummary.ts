// The run summary on the game-over screen (1.0.9): a small line of the ship's
// speed over the run, where it ended (distance and level), near misses and the
// best chain. It folds away behind "details" so the screen stays clean.

export interface RunSummary {
  /** Speed (units/s), sampled about once a second. */
  speeds: number[];
  /** How far the run went (units) and the level it ended on. */
  distance: number;
  level: number;
  nearMisses: number;
  bestChain: number;
  /** Crashed (true), or finished a course (false). */
  crashed: boolean;
  /** What the ship hit, if it crashed into something ('' for a fall or unknown). */
  hit: string;
}

/** An SVG polyline's points for `values` in a w x h box (the lowest at the bottom); '' for fewer than two. */
export function sparkPoints(values: readonly number[], w: number, h: number): string {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - lo) / span) * (h - 2) - 1;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}

/** "1.8 km" (one decimal under 10 km). */
export function distanceText(units: number): string {
  const km = units / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** The summary's rows, in words. */
export function summaryRows(s: RunSummary): [string, string][] {
  const where = `${distanceText(s.distance)} · level ${s.level}`;
  const rows: [string, string][] = [[s.crashed ? 'crashed at' : 'finished at', where]];
  if (s.crashed && s.hit) rows.push(['hit', s.hit]);
  rows.push(['near misses', String(s.nearMisses)], ['best chain', s.bestChain > 0 ? `x${s.bestChain}` : '-']);
  if (s.speeds.length > 1) rows.push(['top speed', `${Math.round(Math.max(...s.speeds))}`]);
  return rows;
}

/** The speed line as an SVG (the text colour, a faint fill under it). */
export function sparkSvg(values: readonly number[]): string {
  const W = 240;
  const H = 44;
  const pts = sparkPoints(values, W, H);
  if (!pts) return '';
  return `<svg class="over-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,${H} ${pts} ${W},${H}" fill="currentColor" fill-opacity=".1"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
