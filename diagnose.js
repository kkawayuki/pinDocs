// Paste into the DevTools console on the Google Docs home page.
// Prints (and copies to the clipboard) what the extension found on the page
// and the structure of the first document card, so content.js's selectors and
// doc-id lookup can be matched to Google's current markup.
(() => {
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + [...el.classList].join('.');
    for (const a of el.attributes) {
      if (a.name.startsWith('data-') || a.name.startsWith('js') || ['href', 'role', 'aria-label', 'src', 'tabindex'].includes(a.name)) {
        s += `[${a.name}="${a.value.slice(0, 80)}"]`;
      }
    }
    const r = el.getBoundingClientRect();
    if (r.width) s += `  (${Math.round(r.width)}x${Math.round(r.height)})`;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
    if (text) s += `  "${text.slice(0, 40)}"`;
    return s;
  };

  const lines = [
    `known card class (.docs-homescreen-grid-item): ${document.querySelectorAll('.docs-homescreen-grid-item').length}`,
    `pin buttons added by the extension (.dhp-pin): ${document.querySelectorAll('.dhp-pin').length}`,
    '',
  ];

  // Find a card without relying on class names: the date line under a card
  // ("Modified ...", "Opened ..."), walked up to the box that also holds the preview.
  let card = document.querySelector('.docs-homescreen-grid-item');
  if (!card) {
    const date = [...document.querySelectorAll('body *')].find(
      (el) => !el.children.length && /^(Modified|Opened|Shared)\b/.test(el.textContent.trim())
    );
    card = date;
    while (card && !card.querySelector('img')) card = card.parentElement;
  }

  if (!card) {
    lines.push('(no document card found)');
  } else {
    lines.push('--- ancestors ---');
    for (let el = card.parentElement, i = 0; el && i < 4; el = el.parentElement, i++) lines.push(describe(el));
    lines.push('', '--- first card ---');
    const dump = (el, depth) => {
      if (depth > 8) return;
      lines.push('  '.repeat(depth) + describe(el));
      for (const c of el.children) dump(c, depth + 1);
    };
    dump(card, 0);
    // The doc id isn't in any attribute above, so show the preview's full markup
    // (inline styles and image URLs included).
    const thumb = card.querySelector('.docs-homescreen-grid-item-thumbnail');
    if (thumb) lines.push('', '--- thumbnail markup ---', thumb.outerHTML.slice(0, 1500));
  }
  const out = lines.join('\n');
  console.log(out);
  try { copy(out); console.log('(copied to clipboard)'); } catch {}
})();
