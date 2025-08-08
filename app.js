
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// Initialize tabs
$$('#tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.tab').forEach(t => t.classList.remove('active'));
    const targetTab = $('#' + tab);
    if (targetTab) targetTab.classList.add('active');
  });
});

const STORAGE_KEY = 'hc-build-v1';
function saveBuild(build) { localStorage.setItem(STORAGE_KEY, JSON.stringify(build)); }
function loadBuild() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }

const SLOTS = ['helm','amulet','chest','gloves','pants','boots','ring1','ring2','weapon','offhand'];
let build = loadBuild();

// Add status indicator functionality
function updateSlotStatus(slot, status) {
  const slotEl = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!slotEl) return;
  
  const statusEl = slotEl.querySelector('.status');
  const indicator = slotEl.querySelector('.status-indicator') || createStatusIndicator(slotEl);
  
  if (!statusEl || !indicator) return;
  
  // Remove existing status classes
  statusEl.className = 'status';
  indicator.className = 'status-indicator';
  
  // Add new status
  if (status) {
    statusEl.textContent = status;
    statusEl.classList.add(status.toLowerCase());
    indicator.classList.add(status.toLowerCase());
  } else {
    statusEl.textContent = '—';
    statusEl.classList.add('unscored');
  }
}

function createStatusIndicator(slotEl) {
  const indicator = document.createElement('div');
  indicator.className = 'status-indicator';
  slotEl.appendChild(indicator);
  return indicator;
}

// Enhanced slot click with better UX
SLOTS.forEach(slot => {
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!el) return;
  
  const img = el.querySelector('img');
  const status = el.querySelector('.status');
  
  if (build[slot]?.image && img) {
    img.src = build[slot].image;
    updateSlotStatus(slot, build[slot].status);
  }
  
  el.addEventListener('click', async () => {
    // Add loading state
    el.classList.add('loading');
    
    const input = document.createElement('input');
    input.type = 'file'; 
    input.accept = 'image/*';
    
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) {
        el.classList.remove('loading');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        if (img) img.src = reader.result;
        build[slot] = build[slot] || {};
        build[slot].image = reader.result;
        build[slot].status = 'Unscored';
        updateSlotStatus(slot, 'Unscored');
        saveBuild(build);
        el.classList.remove('loading');
        
        // Add success animation
        el.style.transform = 'scale(1.05)';
        setTimeout(() => {
          el.style.transform = '';
        }, 200);
      };
      reader.readAsDataURL(file);
    };
    
    input.click();
  });
});

// Enhanced demo load with progress
const btnLoadDemo = $('#btn-load-demo');
if (btnLoadDemo) {
  btnLoadDemo.addEventListener('click', async () => {
    btnLoadDemo.textContent = 'Loading...';
    btnLoadDemo.disabled = true;
    
    try {
      const resp = await fetch('rulepack.json');
      const rules = await resp.json();
      
      const rulesDate = document.getElementById('rules-date');
      const affixJson = document.getElementById('affix-json');
      const temperingJson = document.getElementById('tempering-json');
      const mwJson = document.getElementById('mw-json');
      const skillsList = document.getElementById('skills-list');
      const paragonList = document.getElementById('paragon-list');
      
      if (rulesDate) rulesDate.textContent = rules.sources.updated;
      if (affixJson) affixJson.textContent = JSON.stringify(rules.slots, null, 2);
      if (temperingJson) temperingJson.textContent = JSON.stringify(rules.slots, null, 2);
      if (mwJson) mwJson.textContent = 'Masterworking priorities TBD';
      if (skillsList) skillsList.innerHTML = '<li>Hydra core; rest per Icy Veins</li>';
      if (paragonList) paragonList.innerHTML = '<li>Boards & glyphs TBD</li>';
      
      btnLoadDemo.textContent = '✓ Loaded';
      btnLoadDemo.style.background = 'var(--success)';
      setTimeout(() => {
        btnLoadDemo.textContent = 'Load Demo Build';
        btnLoadDemo.style.background = '';
        btnLoadDemo.disabled = false;
      }, 1000);
      
    } catch (error) {
      console.error('Error loading demo:', error);
      btnLoadDemo.textContent = 'Error Loading';
      btnLoadDemo.style.background = 'var(--error)';
      setTimeout(() => {
        btnLoadDemo.textContent = 'Load Demo Build';
        btnLoadDemo.style.background = '';
        btnLoadDemo.disabled = false;
      }, 2000);
    }
  });
}

const btnClearBuild = $('#btn-clear-build');
if (btnClearBuild) {
  btnClearBuild.addEventListener('click', () => {
    if (!confirm('Clear saved build images & notes?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

const NOTES_KEY = 'hc-notes';
const notes = document.getElementById('notes-text');
if (notes) {
  notes.value = localStorage.getItem(NOTES_KEY) || '';
  notes.addEventListener('input', () => localStorage.setItem(NOTES_KEY, notes.value));
}

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
if (camSlot) {
  SLOTS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s[0].toUpperCase() + s.slice(1);
    camSlot.appendChild(opt);
  });
}

// Enhanced camera functionality
async function openCamera() {
  if (!camPanel || !camVideo || !btnOpenCam) return;
  
  try {
    camPanel.classList.remove('hidden');
    if (btnSaveCapture) btnSaveCapture.disabled = true;
    if (camCanvas) camCanvas.classList.add('hidden');
    lastCaptureDataUrl = null;
    
    // Add loading state
    btnOpenCam.classList.add('loading');
    btnOpenCam.textContent = 'Opening Camera...';

    camStream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    
    camVideo.srcObject = camStream;
    btnOpenCam.classList.remove('loading');
    btnOpenCam.textContent = 'Camera Active';
    
    // Add success feedback
    camPanel.style.borderColor = 'var(--success)';
    
  } catch (e) {
    console.error('Camera error:', e);
    alert('Camera error: ' + e.message);
    btnOpenCam.classList.remove('loading');
    btnOpenCam.textContent = 'Open Camera';
  }
}

// Stop camera
function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  if (camPanel) camPanel.classList.add('hidden');
  if (btnOpenCam) {
    btnOpenCam.textContent = 'Open Camera';
    btnOpenCam.classList.remove('loading');
  }
}

// Enhanced capture with visual feedback
function captureFrame() {
  if (!camVideo || !camCanvas || !btnCapture) return;
  
  const vw = camVideo.videoWidth || 1280;
  const vh = camVideo.videoHeight || 720;
  camCanvas.width = vw;
  camCanvas.height = vh;
  const ctx = camCanvas.getContext('2d');
  ctx.drawImage(camVideo, 0, 0, vw, vh);
  lastCaptureDataUrl = camCanvas.toDataURL('image/jpeg', 0.92);
  camCanvas.classList.remove('hidden');
  if (btnSaveCapture) btnSaveCapture.disabled = false;
  
  // Add capture feedback
  btnCapture.textContent = '✓ Captured';
  btnCapture.style.background = 'var(--success)';
  setTimeout(() => {
    btnCapture.textContent = 'Capture';
    btnCapture.style.background = '';
  }, 1000);
}

// Enhanced save with feedback
function saveCaptureToSlot() {
  if (!lastCaptureDataUrl || !camSlot) return;
  
  const slot = camSlot.value;
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!el) return;
  
  const img = el.querySelector('img');
  if (!img) return;

  img.src = lastCaptureDataUrl;
  build[slot] = build[slot] || {};
  build[slot].image = lastCaptureDataUrl;
  build[slot].status = 'Unscored';
  updateSlotStatus(slot, 'Unscored');
  saveBuild(build);
  
  // Add success animation
  el.style.transform = 'scale(1.05)';
  setTimeout(() => {
    el.style.transform = '';
  }, 200);
  
  stopCamera();
}

// Hook up camera buttons
if (btnOpenCam) {
  btnOpenCam.textContent = 'Open Camera';
  btnOpenCam.addEventListener('click', openCamera);
}

if (btnCapture) {
  btnCapture.addEventListener('click', captureFrame);
}

if (btnSaveCapture) {
  btnSaveCapture.addEventListener('click', saveCaptureToSlot);
}

if (btnCancelCam) {
  btnCancelCam.addEventListener('click', stopCamera);
}
