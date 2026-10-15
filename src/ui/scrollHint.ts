// A sideways row's scroll bar, always showing (a native one hides on phones):
// a thin track under the row whose thumb is the share of the row in view and
// sits where the row is scrolled to. The row gets `more-right` (a fade on its
// right edge) while there's more to see. Track and fade go when it all fits.

/** Put a scroll bar under `row`; returns the redraw (call it after filling the row). */
export function scrollHint(row: HTMLElement): () => void {
  const track = document.createElement('div');
  track.className = 'scroll-hint';
  track.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('span');
  thumb.className = 'scroll-thumb';
  track.append(thumb);
  row.after(track);
  const update = (): void => {
    const { scrollLeft, scrollWidth, clientWidth } = row;
    const over = scrollWidth - clientWidth;
    const more = over > 2 && clientWidth > 0;
    track.hidden = !more;
    row.classList.toggle('more-right', more && scrollLeft < over - 2);
    if (!more) return;
    thumb.style.width = `${(clientWidth / scrollWidth) * 100}%`;
    thumb.style.left = `${(Math.max(0, Math.min(over, scrollLeft)) / scrollWidth) * 100}%`;
  };
  row.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(row);
  update();
  return update;
}
