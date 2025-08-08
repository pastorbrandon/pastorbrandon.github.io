
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

// ----- Camera wiring -----
const camPanel = document.getElementById('cameraPanel');
const camVideo = document.getElementById('camPreview');
const camCanvas = document.getElementById('camCanvas');
const camSlot = document.getElementById('camSlot');
const btnOpenCam = document.getElementById('btn-check-gear');
const btnCapture = document.getElementById('btn-capture');
const btnSaveCapture = document.getElementById('btn-save-capture');
const btnCancelCam = document.getElementById('btn-cancel-camera');

let camStream = null;
let lastCaptureDataUrl = null;

// Populate slot dropdown
SLOTS.forEach(s => {
  const opt = document.createElement('option');
  opt.value = s;
  opt.textContent = s[0].toUpperCase() + s.slice(1);
  camSlot.appendChild(opt);
});

// Open camera
async function openCamera() {
  try {
    camPanel.classList.remove('hidden');
    btnSaveCapture.disabled = true;
    camCanvas.classList.add('hidden');
    lastCaptureDataUrl = null;

    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    camVideo.srcObject = camStream;
  } catch (e) {
    alert('Camera error: ' + e.message);
  }
}

// Stop camera
function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  camPanel.classList.add('hidden');
}

// Capture current frame
function captureFrame() {
  const vw = camVideo.videoWidth || 1280;
  const vh = camVideo.videoHeight || 720;
  camCanvas.width = vw;
  camCanvas.height = vh;
  const ctx = camCanvas.getContext('2d');
  ctx.drawImage(camVideo, 0, 0, vw, vh);
  lastCaptureDataUrl = camCanvas.toDataURL('image/jpeg', 0.92);
  camCanvas.classList.remove('hidden');
  btnSaveCapture.disabled = false;
}

// Save to selected slot card
function saveCaptureToSlot() {
  if (!lastCaptureDataUrl) return;
  const slot = camSlot.value;
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  const img = el.querySelector('img');
  const status = el.querySelector('.status');

  img.src = lastCaptureDataUrl;
  build[slot] = build[slot] || {};
  build[slot].image = lastCaptureDataUrl;
  build[slot].status = 'Unscored';
  saveBuild(build);
  status.textContent = 'Unscored';
  stopCamera();
}

// Hook up buttons
btnOpenCam.textContent = 'Open Camera';
btnOpenCam.addEventListener('click', openCamera);
btnCapture.addEventListener('click', captureFrame);
btnSaveCapture.addEventListener('click', saveCaptureToSlot);
btnCancelCam.addEventListener('click', stopCamera);

;
