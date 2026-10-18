// Google Docs home page: resizable document previews, a pin button on each
// document card, and a "Pinned documents" section above "Recent documents"
// holding copies of the pinned cards.
// Google's docs-homescreen-* class names aren't a public API. If the pin
// buttons or the resizing stop working, run diagnose.js on the home page to
// find the current names.

const CARD = '.docs-homescreen-grid-item';
const THUMB = '.docs-homescreen-grid-item-thumbnail';
const TITLE = '.docs-homescreen-grid-item-title';

const PIN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24" width="64" height="64" aria-hidden="true"><path fill="#ea4335" d="M10.5 3h3v7.5h-3z"/><path fill="#34a853" d="M10.5 13.5h3V21h-3z"/><path fill="#fbbc04" d="M3 10.5h7.5v3H3z"/><path fill="#4285f4" d="M13.5 10.5H21v3h-7.5z"/><path fill="#ea4335" d="M10.5 10.5h3v3h-3z"/></svg>';

let pins = []; // [{ id, title, thumb }], oldest first; thumb is the preview image URL

const docUrl = (id) => `https://docs.google.com/document/d/${id}/edit`;
// Keeps the signed-in account (/document/u/1/...) when there are several.
const newDocUrl = () => `https://docs.google.com${location.pathname.match(/^\/document\/u\/\d+/)?.[0] || '/document'}/create`;

// Doc ids look like 1AbC...: 25+ letters, digits, - and _.
const ID_IN_URL = /(?:\/d\/|[?&]id=)([\w-]{25,})/;

// The document id: a data-id or link if Google provides one; otherwise the
// cards have neither, and the id is taken from the preview image's URL.
function cardDocId(card) {
  const el = card.matches('[data-id]') ? card : card.querySelector('[data-id]');
  if (el?.dataset.id) return el.dataset.id;
  const link = card.querySelector('a[href*="/document/d/"]') || card.closest('a[href*="/document/d/"]');
  if (link) return link.href.match(ID_IN_URL)?.[1] || null;
  for (const node of card.querySelectorAll('[style*="url("], img[src]')) {
    const url = node.tagName === 'IMG' ? node.src : node.getAttribute('style');
    const id = url.match(ID_IN_URL)?.[1];
    if (id) return id;
  }
  return null;
}

function cardTitle(card) {
  return (card.querySelector(TITLE)?.textContent || '').trim() || 'Untitled document';
}

// The preview image URL from the thumbnail's inline background-image.
function cardThumb(card) {
  return card.querySelector(THUMB)?.getAttribute('style')?.match(/url\(["']?(.*?)["']?\)/)?.[1] || null;
}

// Google's own cards, not the extension's copies (in Pinned documents, or the
// one following the pointer while dragging).
function liveCards() {
  return [...document.querySelectorAll(CARD)].filter((card) => !card.classList.contains('dhp-card'));
}

// --- Preview height ---------------------------------------------------------

function applyHeight(height) {
  let style = document.getElementById('dhp-height');
  if (!height) {
    style?.remove(); // Google's own size
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = 'dhp-height';
    document.head.appendChild(style);
  }
  style.textContent = `
    ${CARD} { height: auto !important; }
    ${THUMB} { height: ${height}px !important; overflow: hidden !important; }
    ${THUMB} img { width: 100% !important; height: 100% !important; object-fit: cover !important; object-position: top !important; }
  `;
}

// --- Pin buttons on the cards -----------------------------------------------

function updateCards() {
  for (const card of document.querySelectorAll(CARD)) {
    if (card.classList.contains('dhp-new-card') || card.classList.contains('dhp-ghost')) continue;
    const id = cardDocId(card);
    if (!id) continue;
    let btn = card.querySelector(':scope > .dhp-pin');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dhp-pin';
      btn.innerHTML = PIN_ICON;
      card.appendChild(btn);
    }
    btn.dataset.id = id;
    const pin = pins.find((p) => p.id === id);
    btn.classList.toggle('dhp-pinned', !!pin);
    btn.title = pin ? 'Unpin' : 'Pin to top';
    if (section.contains(card)) continue;

    // Pinned docs show in Pinned documents only, not in Recent documents too.
    card.classList.toggle('dhp-hidden-card', !!pin);

    // Keep pinned titles and previews current (a doc renamed or edited).
    if (!pin) continue;
    const title = cardTitle(card);
    const thumb = cardThumb(card) || pin.thumb;
    if (pin.title !== title || pin.thumb !== thumb) savePins(pins.map((p) => (p.id === id ? { ...p, title, thumb } : p)));
  }
}

// The cards open their document on mousedown/click, so swallow those events
// for the pin button before Google's handlers see them.
for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick']) {
  window.addEventListener(type, (e) => {
    const btn = e.target.closest?.('.dhp-pin');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // This stops the event, so a drag released over a pin button ends here,
    // and the click that follows it mustn't unpin anything.
    if (type === 'pointerdown') justDragged = false;
    if (type === 'pointerup') endDrag();
    if (type === 'click' && !justDragged) togglePin(btn.dataset.id, btn.closest(CARD));
  }, true);
}

function togglePin(id, card) {
  if (pins.some((p) => p.id === id)) savePins(pins.filter((p) => p.id !== id));
  else savePins([...pins, { id, title: card ? cardTitle(card) : 'Untitled document', thumb: card ? cardThumb(card) : null }]);
}

function savePins(next) {
  pins = next;
  chrome.storage.local.set({ pins });
}

// --- "Pinned documents" section ---------------------------------------------

const section = document.createElement('section');
section.id = 'dhp-pinned';
const grid = document.createElement('div');
grid.className = 'dhp-grid';
{
  const heading = document.createElement('h2');
  heading.className = 'dhp-heading';
  heading.textContent = 'Pinned documents';
  section.append(heading, grid);
}

// The grid starts with a "New document" card (standing in for the hidden
// "Start a new document" section), then the pinned cards: copies of Google's
// own card for each doc, so they look the same. A doc that isn't in the loaded Recent documents list gets a copy
// of another card with its saved title and preview filled in. Rebuilt only
// when the pins or their source cards change, since rebuilding is itself a
// page change the observer sees.
let renderedKey = null;
function renderSection() {
  if (drag?.ghost) return; // not mid-drag; endDrag re-renders
  const live = liveCards();
  const byId = new Map(live.map((card) => [cardDocId(card), card]));
  const key = JSON.stringify([
    live.length > 0,
    pins.map((p) => {
      const source = byId.get(p.id);
      return [p.id, p.title, p.thumb, source ? source.querySelector(THUMB)?.getAttribute('style') + source.textContent : null];
    }),
  ]);
  if (key === renderedKey) return;
  renderedKey = key;

  // Every card is built from one of Google's, so wait for the list to load.
  if (!live.length) {
    grid.replaceChildren();
    return;
  }
  const cards = pins.map((pin) => copyCard(pin, byId.get(pin.id) || live[0], !byId.has(pin.id)));
  if (!pins.length) {
    const hint = document.createElement('p');
    hint.className = 'dhp-hint';
    hint.textContent = 'Hover a document below and click its pin to add it here.';
    cards.push(hint);
  }
  grid.replaceChildren(newDocCard(live[0]), ...cards);
}

// A card-sized "New document" tile: a copy of one of Google's cards with its
// preview swapped for a + and its details for a label.
function newDocCard(source) {
  const card = cleanCopy(source);
  card.classList.add('dhp-new-card');
  card.dataset.href = newDocUrl();
  card.title = 'Start a new document';
  const thumb = card.querySelector(THUMB);
  if (thumb) {
    thumb.removeAttribute('style');
    thumb.replaceChildren();
    thumb.insertAdjacentHTML('beforeend', PLUS_ICON);
  }
  const title = card.querySelector(TITLE);
  if (title) {
    title.textContent = 'New document';
    title.removeAttribute('aria-label');
  }
  card.querySelector('.docs-homescreen-grid-metadata-row')?.remove();
  return card;
}

// A copy of one of Google's cards, without Google's ids and roles (those stay
// on its own cards only) or the extension's pin button and hiding.
function cleanCopy(source) {
  const card = source.cloneNode(true);
  for (const el of [card, ...card.querySelectorAll('[id], [role], [tabindex]')]) {
    el.removeAttribute('id');
    el.removeAttribute('role');
    el.removeAttribute('tabindex');
  }
  card.querySelector('.dhp-pin')?.remove();
  card.classList.remove('dhp-hidden-card');
  card.classList.add('dhp-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  return card;
}

function copyCard(pin, source, fillIn) {
  const card = cleanCopy(source);
  card.dataset.id = pin.id;
  card.dataset.href = docUrl(pin.id);
  const thumb = card.querySelector(THUMB);
  if (fillIn) {
    const title = card.querySelector(TITLE);
    if (title) {
      title.textContent = pin.title;
      title.removeAttribute('aria-label');
    }
    const label = card.querySelector('.docs-homescreen-grid-item-sort-identifier');
    if (label) label.textContent = 'Pinned';
    const time = card.querySelector('.docs-homescreen-grid-item-time');
    if (time) {
      time.textContent = '';
      time.removeAttribute('aria-label');
    }
    if (thumb) thumb.style.backgroundImage = pin.thumb ? `url("${pin.thumb}")` : 'none';
  } else if (thumb && !cardThumb(source) && pin.thumb) {
    // The real card's preview hasn't loaded yet (it loads as it scrolls into view).
    thumb.style.backgroundImage = `url("${pin.thumb}")`;
  }
  return card;
}

// The copies have none of Google's handlers, so open their doc (or a new one)
// ourselves, and keep Google's page-wide handlers from acting on them. The
// pin button's handler above runs first and stops these.
function openCopy(card, newTab) {
  if (newTab) window.open(card.dataset.href, '_blank');
  else location.href = card.dataset.href;
}

for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick']) {
  window.addEventListener(type, (e) => {
    const card = e.target.closest?.('.dhp-card');
    if (!card) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (type === 'pointerdown' && e.button === 0) startDrag(card, e);
    // This stops the event before the window's pointerup listener below, so a
    // drag released over a card ends here.
    if (type === 'pointerup') endDrag();
    if (type === 'click' && !justDragged) openCopy(card, e.ctrlKey || e.metaKey || e.shiftKey);
    if (type === 'auxclick' && e.button === 1) openCopy(card, true);
  }, true);
}

// --- Reordering pinned cards by dragging ------------------------------------

// A press on a pinned card becomes a drag once the pointer moves a few pixels;
// otherwise it's a click that opens the doc. While dragging, the card stays in
// the grid as a faded placeholder that moves to wherever it would drop, and a
// copy follows the pointer. The new order is saved on release.
const DRAG_THRESHOLD = 5;
let drag = null; // { card, startX, startY, offsetX, offsetY, ghost }
let justDragged = false; // swallows the click that follows a drag

function startDrag(card, e) {
  justDragged = false;
  if (!card.dataset.id) return; // the New document card stays first
  const r = card.getBoundingClientRect();
  drag = { card, startX: e.clientX, startY: e.clientY, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top, ghost: null };
}

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    const r = drag.card.getBoundingClientRect();
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.classList.add('dhp-ghost');
    drag.ghost.style.width = `${r.width}px`;
    drag.ghost.style.height = `${r.height}px`;
    document.body.appendChild(drag.ghost);
    drag.card.classList.add('dhp-placeholder');
  }
  drag.ghost.style.left = `${e.clientX - drag.offsetX}px`;
  drag.ghost.style.top = `${e.clientY - drag.offsetY}px`;

  // Move the placeholder before or after the pinned card under the pointer.
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.dhp-card');
  if (!target || target === drag.card || !grid.contains(target)) return;
  if (!target.dataset.id) {
    target.after(drag.card); // over New document: first among the pins
    return;
  }
  const r = target.getBoundingClientRect();
  if (e.clientX < r.left + r.width / 2) target.before(drag.card);
  else target.after(drag.card);
});

function endDrag() {
  if (!drag) return;
  const { card, ghost } = drag;
  drag = null;
  if (!ghost) return; // never moved far enough: a click
  justDragged = true;
  ghost.remove();
  card.classList.remove('dhp-placeholder');
  const order = [...grid.querySelectorAll('.dhp-card[data-id]')].map((el) => el.dataset.id);
  const reordered = order.map((id) => pins.find((p) => p.id === id)).filter(Boolean);
  if (reordered.length === pins.length && reordered.some((p, i) => p !== pins[i])) savePins(reordered);
  schedule(); // catch up on anything skipped during the drag
}

window.addEventListener('pointerup', endDrag, true);
window.addEventListener('pointercancel', endDrag, true);

window.addEventListener('keydown', (e) => {
  const card = e.target.closest?.('.dhp-card');
  if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openCopy(card, e.ctrlKey || e.metaKey);
}, true);

// Placed as the first thing inside the section that holds the Recent
// documents header and grid. (Placed before that section instead, it sits
// under the page's fixed search header.) Directly above the grid if that
// section can't be found.
function placeSection() {
  const card = liveCards()[0];
  if (!card) return;
  const container = card.closest('.docs-homescreen-item-container');
  if (container) {
    if (container.firstElementChild !== section) container.prepend(section);
  } else if (section.nextElementSibling !== card.parentElement) {
    card.parentElement.before(section);
  }
  alignSection();
  hideNewDocSection(container || card.parentElement);
}

// Hides Google's "Start a new document" section (the New document card replaces it):
// the block above the Recent documents section that holds that heading.
// Only once Pinned documents is on the page, so there's always a way to make a doc.
let newDocSection = null;
function hideNewDocSection(anchor) {
  if (newDocSection?.isConnected) return;
  const label = [...document.querySelectorAll('div, span, h1, h2, h3')].find(
    (el) => !el.children.length && el.textContent.trim() === 'Start a new document'
  );
  if (!label) return;
  // The child of the label's and the Recent documents section's closest shared ancestor.
  let block = label;
  while (block.parentElement && !block.parentElement.contains(anchor)) block = block.parentElement;
  // If that block is big enough to take the page header with it, leave it alone.
  // Nor hide the block if Pinned documents itself ended up inside it.
  if (block === document.body || block.contains(section) || block.querySelector('input, header, [role="search"]')) return;
  newDocSection = block;
  newDocSection.classList.add('dhp-hidden');
}

// Gives the section the same left and right edges as the first row of
// Recent documents cards, and the copies the same spacing as Google's cards.
function alignSection() {
  const cards = liveCards().map((card) => [card, card.getBoundingClientRect()]).filter(([, r]) => r.width);
  if (!cards.length) return;
  const [first, firstRect] = cards[0];
  const firstRow = cards.filter(([, r]) => Math.abs(r.top - firstRect.top) < 1);
  const left = Math.min(...firstRow.map(([, r]) => r.left));
  const right = Math.max(...firstRow.map(([, r]) => r.right));
  // Shift the section's current left margin by however far it is from the cards.
  const margin = parseFloat(getComputedStyle(section).marginLeft) + left - section.getBoundingClientRect().left;
  // Only written when they change, since the page observer also watches style attributes.
  setVar('--dhp-left', `${margin}px`);
  setVar('--dhp-width', `${right - left}px`);

  // Space between Google's cards beyond their own margins (which the copies keep).
  // (Pinned docs' cards are hidden in Recent documents and measure 0 wide, so
  // they're already filtered out above.)
  const cs = getComputedStyle(first);
  if (firstRow[1]) {
    const gap = firstRow[1][1].left - firstRect.right - parseFloat(cs.marginRight) - parseFloat(cs.marginLeft);
    setVar('--dhp-gap-x', `${Math.max(0, gap)}px`);
  }
  const below = cards.find(([, r]) => r.top > firstRect.bottom);
  if (below) {
    const gap = below[1].top - firstRect.bottom - parseFloat(cs.marginBottom) - parseFloat(cs.marginTop);
    setVar('--dhp-gap-y', `${Math.max(0, gap)}px`);
  }
  // Google's cards keep their right margin even at the end of a row (its grid
  // is wider than the cards to fit it), so the copies' grid needs that room
  // too, or the last card of each row wraps.
  setVar('--dhp-card-margin-right', `${parseFloat(cs.marginRight)}px`);
  dropBelowHeader();
  closeGapBelow();
}

// Google shifts the Recent documents section up under the search bar at the
// top of the page (its own header is offset back down), so Pinned documents,
// as that section's first child, would sit behind the search bar. Push it
// down to just below the header that holds the search box. Measured only with
// the page scrolled to the top, where the positions are the page's resting layout.
function dropBelowHeader() {
  if (window.scrollY || document.body.scrollTop || document.scrollingElement?.scrollTop) return;
  const search = [...document.querySelectorAll('input')].find((input) => {
    const r = input.getBoundingClientRect();
    return r.width > 100 && r.top >= 0 && r.top < 150;
  });
  if (!search) return;
  // The search box's widest short ancestor: the header bar it sits in.
  let header = search;
  while (header.parentElement && header.parentElement !== document.body && header.parentElement.getBoundingClientRect().height < 100) {
    header = header.parentElement;
  }
  const target = header.getBoundingClientRect().bottom + 8;
  const margin = parseFloat(getComputedStyle(section).marginTop) + target - section.getBoundingClientRect().top;
  setVar('--dhp-top', `${Math.max(0, Math.round(margin))}px`);
}

// Google's "Recent documents" header is offset down to make up for the
// section being shifted up under the search bar, which leaves a large empty
// space above it. Pull it up to sit a normal distance below the pinned cards.
// Measured only at the top of the page, since the header floats while scrolling.
const GAP_ABOVE_RECENT = 8;
function closeGapBelow() {
  if (window.scrollY || document.body.scrollTop || document.scrollingElement?.scrollTop) return;
  const header = section.parentElement?.querySelector(':scope > .docs-homescreen-floater-grid-header');
  const content = [...grid.children].map((el) => el.getBoundingClientRect()).filter((r) => r.height);
  if (!header || !content.length) return;
  const bottom = Math.max(...content.map((r) => r.bottom));
  const extra = header.getBoundingClientRect().top - (bottom + GAP_ABOVE_RECENT);
  const margin = parseFloat(getComputedStyle(section).marginBottom) - extra;
  setVar('--dhp-bottom', `${Math.round(margin)}px`);
}

function setVar(name, value) {
  if (section.style.getPropertyValue(name) !== value) section.style.setProperty(name, value);
}

// --- Wiring -----------------------------------------------------------------

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderSection();
    updateCards();
    placeSection();
  });
}

chrome.storage.local.get({ pins: [], previewHeight: null }, (data) => {
  pins = data.pins;
  applyHeight(data.previewHeight);
  schedule();
  // Cards are added as the list loads and as you scroll, and their previews
  // (which hold the doc id) load in as they come into view.
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'src'],
  });
});

// The grid's width changes with the window, and the section follows it.
window.addEventListener('resize', schedule);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.previewHeight) applyHeight(changes.previewHeight.newValue);
  if (changes.pins) {
    pins = changes.pins.newValue || [];
    schedule();
  }
});
