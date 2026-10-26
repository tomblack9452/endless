import type { ReportReason, ReportResult } from '../server/backend';

// "report" at the foot of a pilot's card on the boards: tap it, pick why, and
// it's sent. Never on your own row (game.ts leaves it off).

export const REPORT_REASONS: readonly [ReportReason, string][] = [
  ['name', 'offensive name'],
  ['score', 'impossible score'],
  ['other', 'other'],
];

/** What the card says after a report: thanks, already sent this week, or why not. */
export function reportAnswer(r: ReportResult): string {
  if (!r.ok) return r.message;
  return r.already ? 'you reported them this week already' : "thanks. we'll take a look";
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function line(text: string): HTMLElement {
  return Object.assign(document.createElement('div'), { className: 'label dim', textContent: text });
}

/** Android back (or Escape) with a report's reasons open: cancel it, as its own button does. False if none is open. */
export function cancelOpenReport(): boolean {
  const cancel = document.querySelector<HTMLButtonElement>('.pilot-report-reasons ~ .pilot-report-link');
  if (!cancel) return false;
  cancel.click();
  return true;
}

/** The report link, and the reasons it opens into. */
export function reportLink(send: (reason: ReportReason) => Promise<ReportResult>): HTMLElement {
  const box = document.createElement('div');
  box.className = 'pilot-report';
  const link = button('label link dim pilot-report-link', 'report', () => ask());
  const ask = () => {
    const picks = document.createElement('div');
    picks.className = 'pilot-report-reasons';
    picks.append(...REPORT_REASONS.map(([id, text]) => button('tab', text, () => void go(id))));
    box.replaceChildren(line('report them for'), picks, button('label link dim pilot-report-link', 'cancel', () => box.replaceChildren(link)));
  };
  const go = async (reason: ReportReason) => {
    box.replaceChildren(line('sending'));
    const r = await send(reason);
    box.replaceChildren(line(reportAnswer(r)));
    if (!r.ok) box.append(link); // no signal: it can be tried again
  };
  box.append(link);
  return box;
}
