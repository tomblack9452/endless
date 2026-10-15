import type { ControlId } from './onboarding';

// The small moving diagrams on the control cards and under the steering
// lesson: line drawings in the ink colour, looped with CSS (style.css,
// "control diagrams"). Each part that moves has a class the CSS animates; with
// data-dir="l" or "r" on the wrapper they hold that way and pulse instead (the
// steering lesson, pointing at the safe line), and with reduce motion they
// stand still, with arrows each way.

/** The ship, seen from behind and above: a dart, nose up. */
const SHIP = '<path class="art-ship-shape" d="M0 -5.5 4.2 4 0 2.2 -4.2 4z"/>';

/** A phone, upright, 36 by 64. */
const PHONE = '<rect x="14" y="8" width="36" height="64" rx="6"/><path d="M28 12h8"/>';

const ARROWS = '<g class="art-rm"><path d="M20 30l-4 4 4 4M44 30l4 4-4 4"/></g>';

export function controlArt(id: ControlId): string {
  let body: string;
  switch (id) {
    case 'drag':
      body = `${PHONE}
        <g class="art-ship" transform="translate(32 60)"><g class="art-move-s">${SHIP}</g></g>
        <g class="art-thumb" transform="translate(32 42)"><g class="art-move-t"><circle r="6.5" class="art-fill"/><path d="M-10 0h-3M10 0h3" class="art-trail"/></g></g>
        ${ARROWS}`;
      break;
    case 'sides':
      body = `${PHONE}
        <rect class="art-half art-half-l" x="15" y="20" width="16.5" height="51" rx="0"/>
        <rect class="art-half art-half-r" x="32.5" y="20" width="16.5" height="51" rx="0"/>
        <path d="M32 20v51" stroke-dasharray="2 3"/>
        <circle class="art-press art-press-l" cx="23" cy="48" r="5.5"/>
        <circle class="art-press art-press-r" cx="41" cy="48" r="5.5"/>
        <g class="art-ship" transform="translate(32 60)"><g class="art-move-s">${SHIP}</g></g>
        ${ARROWS}`;
      break;
    case 'tilt':
      body = `<g class="art-phone">${PHONE}
        <g class="art-ship" transform="translate(32 56)"><g class="art-move-s">${SHIP}</g></g></g>
        <path class="art-arc" d="M18 78q14 6 28 0"/>
        ${ARROWS}`;
      break;
    case 'keys':
      body = `<rect x="6" y="10" width="52" height="36" rx="4"/>
        <g class="art-ship" transform="translate(32 38)"><g class="art-move-s">${SHIP}</g></g>
        <g class="art-key art-key-l"><rect x="13" y="54" width="16" height="14" rx="3"/><path d="M24 61h-6m2.5-3-3 3 3 3"/></g>
        <g class="art-key art-key-r"><rect x="35" y="54" width="16" height="14" rx="3"/><path d="M40 61h6m-2.5-3 3 3-3 3"/></g>
        <text x="21" y="77" class="art-text">a</text><text x="43" y="77" class="art-text">d</text>
        ${ARROWS}`;
      break;
  }
  return `<svg class="ctl-svg" viewBox="0 0 64 80" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
