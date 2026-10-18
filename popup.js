const docUrl = (id) => `https://docs.google.com/document/d/${id}/edit`;

// --- Pinned docs ------------------------------------------------------------

const list = document.getElementById('pins');
const empty = document.getElementById('empty');
const pinCurrent = document.getElementById('pinCurrent');
let pins = [];
let current = null; // the active tab's doc, if it is one: { id, title }

function render() {
  list.replaceChildren();
  for (const { id, title } of pins) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = docUrl(id);
    link.target = '_blank';
    link.title = title;
    link.textContent = title;
    const unpin = document.createElement('button');
    unpin.title = 'Unpin';
    unpin.textContent = '×';
    unpin.addEventListener('click', () => save(pins.filter((p) => p.id !== id)));
    li.append(link, unpin);
    list.appendChild(li);
  }
  empty.hidden = pins.length > 0;

  pinCurrent.hidden = !current;
  if (current) pinCurrent.textContent = pins.some((p) => p.id === current.id) ? 'Unpin this doc' : 'Pin this doc';
}

function save(next) {
  pins = next;
  chrome.storage.local.set({ pins });
  render();
}

pinCurrent.addEventListener('click', () => {
  if (pins.some((p) => p.id === current.id)) save(pins.filter((p) => p.id !== current.id));
  else save([...pins, current]);
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const id = tab?.url?.match(/^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]+)/)?.[1];
  if (id) current = { id, title: (tab.title || '').replace(/ - Google Docs$/, '') || 'Untitled document' };
  chrome.storage.local.get({ pins: [] }, (data) => {
    pins = data.pins;
    render();
  });
});

// --- Preview height ---------------------------------------------------------

const slider = document.getElementById('slider');
const value = document.getElementById('value');

function show(height) {
  slider.value = height || 200;
  value.textContent = height ? `${height}px` : 'Default';
}

chrome.storage.local.get({ previewHeight: null }, ({ previewHeight }) => show(previewHeight));

slider.addEventListener('input', () => {
  const previewHeight = Number(slider.value);
  show(previewHeight);
  chrome.storage.local.set({ previewHeight });
});

document.getElementById('reset').addEventListener('click', () => {
  show(null);
  chrome.storage.local.set({ previewHeight: null });
});
