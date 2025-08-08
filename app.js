
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

$$('#tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.tab').forEach(t => t.classList.remove('active'));
    $('#' + tab).classList.add('active');
  });
});

const STORAGE_KEY = 'hc-build-v1';
function saveBuild(build) { localStorage.setItem(STORAGE_KEY, JSON.stringify(build)); }
function loadBuild() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }

const SLOTS = ['helm','amulet','chest','gloves','pants','boots','ring1','ring2','weapon','offhand'];
let build = loadBuild();

SLOTS.forEach(slot => {
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  const img = el.querySelector('img');
  const status = el.querySelector('.status');
  if (build[slot]?.image) img.src = build[slot].image;
  if (build[slot]?.status) status.textContent = build[slot].status;
  el.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result;
        build[slot] = build[slot] || {};
        build[slot].image = reader.result;
        build[slot].status = 'Unscored';
        saveBuild(build);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
});

$('#btn-load-demo').addEventListener('click', async () => {
  const resp = await fetch('rulepack.json');
  const rules = await resp.json();
  document.getElementById('rules-date').textContent = rules.sources.updated;
  document.getElementById('affix-json').textContent = JSON.stringify(rules.slots, null, 2);
  document.getElementById('tempering-json').textContent = JSON.stringify(rules.slots, null, 2);
  document.getElementById('mw-json').textContent = 'Masterworking priorities TBD';
  document.getElementById('skills-list').innerHTML = '<li>Hydra core; rest per Icy Veins</li>';
  document.getElementById('paragon-list').innerHTML = '<li>Boards & glyphs TBD</li>';
});

$('#btn-clear-build').addEventListener('click', () => {
  if (!confirm('Clear saved build images & notes?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

const NOTES_KEY = 'hc-notes';
const notes = document.getElementById('notes-text');
notes.value = localStorage.getItem(NOTES_KEY) || '';
notes.addEventListener('input', () => localStorage.setItem(NOTES_KEY, notes.value));

document.getElementById('btn-check-gear').addEventListener('click', () => {
  alert('OCR & grading arriving in v0.2.');
});
