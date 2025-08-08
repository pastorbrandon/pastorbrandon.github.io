
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

// Gear analysis state
let currentAnalysis = {
  newGearImage: null,
  detectedSlot: null,
  newGearData: null
};

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

// Gear scoring system
function scoreGear(slot, gearData) {
  if (!gearData || !gearData.affixes) return 0;
  
  try {
    const rules = JSON.parse(localStorage.getItem('rulepack-cache') || '{}');
    const slotRules = rules.slots && rules.slots[slot.charAt(0).toUpperCase() + slot.slice(1)];
    
    if (!slotRules) return Math.floor(Math.random() * 100); // Fallback scoring
    
    let score = 0;
    const mandatoryAffixes = slotRules.mandatoryAffixes || [];
    const preferredAffixes = slotRules.preferredAffixes || [];
    
    // Check mandatory affixes (40 points each)
    mandatoryAffixes.forEach(affix => {
      if (gearData.affixes.some(g => g.toLowerCase().includes(affix.toLowerCase()))) {
        score += 40;
      }
    });
    
    // Check preferred affixes (15 points each)
    preferredAffixes.forEach(affix => {
      if (gearData.affixes.some(g => g.toLowerCase().includes(affix.toLowerCase()))) {
        score += 15;
      }
    });
    
    // Bonus for having more affixes (up to 20 points)
    score += Math.min(gearData.affixes.length * 5, 20);
    
    return Math.min(score, 100);
  } catch (error) {
    console.error('Error scoring gear:', error);
    return Math.floor(Math.random() * 100);
  }
}

function updateGearStatus(slot, score) {
  let status = 'red';
  if (score >= 90) status = 'blue';
  else if (score >= 70) status = 'green';
  else if (score >= 50) status = 'yellow';
  
  updateSlotStatus(slot, status);
  return status;
}

// Enhanced slot click with automatic scoring
SLOTS.forEach(slot => {
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!el) return;
  
  const img = el.querySelector('img');
  const status = el.querySelector('.status');
  
  if (build[slot]?.image && img) {
    img.src = build[slot].image;
    if (build[slot].score !== undefined) {
      updateGearStatus(slot, build[slot].score);
    } else {
      updateSlotStatus(slot, build[slot].status);
    }
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
        
        // Generate gear data and score
        const gearData = generateGearData(slot);
        const score = scoreGear(slot, gearData);
        const status = updateGearStatus(slot, score);
        
        build[slot] = {
          image: reader.result,
          name: gearData.name,
          status: status,
          score: score,
          affixes: gearData.affixes
        };
        
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
      
      // Cache rules for gear scoring
      localStorage.setItem('rulepack-cache', JSON.stringify(rules));
      
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

// ----- Camera wiring for gear analysis -----
const camPanel = document.getElementById('cameraPanel');
const camVideo = document.getElementById('camPreview');
const camCanvas = document.getElementById('camCanvas');
const btnOpenCam = document.getElementById('btn-check-gear');
const btnCapture = document.getElementById('btn-capture');
const btnCancelCam = document.getElementById('btn-cancel-camera');

// Gear analysis panel elements
const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
const currentGearImg = document.getElementById('currentGearImg');
const currentGearInfo = document.getElementById('currentGearInfo');
const newGearImg = document.getElementById('newGearImg');
const newGearInfo = document.getElementById('newGearInfo');
const recommendationText = document.getElementById('recommendationText');
const btnEquip = document.getElementById('btn-equip');
const btnStore = document.getElementById('btn-store');
const btnSalvage = document.getElementById('btn-salvage');

let camStream = null;
let lastCaptureDataUrl = null;

// Enhanced camera functionality for gear analysis
async function openCamera() {
  if (!camPanel || !camVideo || !btnOpenCam) return;
  
  try {
    camPanel.classList.remove('hidden');
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
    btnOpenCam.textContent = 'Check New Gear';
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
    btnOpenCam.textContent = 'Check New Gear';
    btnOpenCam.classList.remove('loading');
  }
}

// Enhanced capture with gear analysis
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
  
  // Add capture feedback
  btnCapture.textContent = '✓ Captured';
  btnCapture.style.background = 'var(--success)';
  setTimeout(() => {
    btnCapture.textContent = '📷 Capture Gear';
    btnCapture.style.background = '';
  }, 1000);
  
  // Analyze the captured gear
  analyzeGear();
}

// Simulate OCR and gear analysis
function analyzeGear() {
  if (!lastCaptureDataUrl) return;
  
  // Show analysis panel
  if (gearAnalysisPanel) gearAnalysisPanel.classList.remove('hidden');
  if (camPanel) camPanel.classList.add('hidden');
  
  // Set new gear image
  if (newGearImg) newGearImg.src = lastCaptureDataUrl;
  
  // Simulate OCR analysis
  setTimeout(() => {
    const detectedSlot = simulateGearDetection();
    const newGearData = generateGearData(detectedSlot);
    
    currentAnalysis = {
      newGearImage: lastCaptureDataUrl,
      detectedSlot: detectedSlot,
      newGearData: newGearData
    };
    
    // Update UI with analysis results
    updateGearAnalysis(detectedSlot, newGearData);
  }, 1500);
}

// Simulate gear type detection (OCR simulation)
function simulateGearDetection() {
  const gearTypes = ['helm', 'amulet', 'chest', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
  return gearTypes[Math.floor(Math.random() * gearTypes.length)];
}

// Generate simulated gear data
function generateGearData(slot) {
  const affixes = [
    'Cooldown Reduction', 'Critical Strike Chance', 'Attack Speed',
    'Movement Speed', 'Resource Generation', 'Maximum Life',
    'Damage Reduction', 'All Resist', 'Intelligence'
  ];
  
  const randomAffixes = affixes
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);
  
  const gearData = {
    name: `${slot.charAt(0).toUpperCase() + slot.slice(1)} of Power`,
    affixes: randomAffixes,
    score: 0,
    status: 'red'
  };
  
  // Score the gear properly
  gearData.score = scoreGear(slot, gearData);
  gearData.status = updateGearStatus(slot, gearData.score);
  
  return gearData;
}

// Update gear analysis UI
function updateGearAnalysis(detectedSlot, newGearData) {
  // Update current gear info
  const currentGear = build[detectedSlot];
  if (currentGearImg && currentGearInfo) {
    if (currentGear && currentGear.image) {
      currentGearImg.src = currentGear.image;
      currentGearInfo.innerHTML = `
        <p class="gear-name">${currentGear.name || 'Equipped Gear'}</p>
        <p class="gear-status">Status: ${currentGear.status || 'Unscored'}</p>
      `;
    } else {
      currentGearImg.src = 'assets/placeholder.png';
      currentGearInfo.innerHTML = `
        <p class="gear-name">No gear equipped</p>
        <p class="gear-status">Status: —</p>
      `;
    }
  }
  
  // Update new gear info
  if (newGearImg && newGearInfo) {
    newGearImg.src = lastCaptureDataUrl;
    newGearInfo.innerHTML = `
      <p class="gear-name">${newGearData.name}</p>
      <p class="gear-status">Status: ${newGearData.status}</p>
    `;
  }
  
  // Generate recommendation
  const recommendation = generateRecommendation(detectedSlot, newGearData);
  if (recommendationText) {
    recommendationText.textContent = recommendation.text;
  }
  
  // Enable/disable buttons based on recommendation
  if (btnEquip) btnEquip.disabled = !recommendation.canEquip;
  if (btnStore) btnStore.disabled = !recommendation.canStore;
  if (btnSalvage) btnSalvage.disabled = !recommendation.canSalvage;
}

// Generate recommendation logic
function generateRecommendation(slot, newGearData) {
  const currentGear = build[slot];
  const currentScore = currentGear ? (currentGear.score || 0) : 0;
  const newScore = newGearData.score;
  
  if (newScore >= 90) {
    return {
      text: `Excellent ${slot}! This is BiS material. Strongly recommend equipping.`,
      canEquip: true,
      canStore: true,
      canSalvage: false
    };
  } else if (newScore >= 70) {
    if (newScore > currentScore + 10) {
      return {
        text: `Good ${slot} with better stats than current. Recommend equipping.`,
        canEquip: true,
        canStore: true,
        canSalvage: false
      };
    } else {
      return {
        text: `Decent ${slot}, but current gear is better. Consider storing for backup.`,
        canEquip: false,
        canStore: true,
        canSalvage: false
      };
    }
  } else if (newScore >= 50) {
    return {
      text: `Mediocre ${slot}. Only equip if current gear is worse.`,
      canEquip: newScore > currentScore,
      canStore: true,
      canSalvage: false
    };
  } else {
    return {
      text: `Poor ${slot}. Recommend salvaging for materials.`,
      canEquip: false,
      canStore: false,
      canSalvage: true
    };
  }
}

// Handle gear action buttons
if (btnEquip) {
  btnEquip.addEventListener('click', () => {
    if (!currentAnalysis.detectedSlot || !currentAnalysis.newGearData) return;
    
    const slot = currentAnalysis.detectedSlot;
    const gearData = currentAnalysis.newGearData;
    
    // Update build with new gear
    build[slot] = {
      image: currentAnalysis.newGearImage,
      name: gearData.name,
      status: gearData.status,
      score: gearData.score,
      affixes: gearData.affixes
    };
    
    // Update paper doll
    const slotEl = document.querySelector(`.slot[data-slot="${slot}"]`);
    if (slotEl) {
      const img = slotEl.querySelector('img');
      if (img) img.src = currentAnalysis.newGearImage;
      updateSlotStatus(slot, gearData.status);
    }
    
    saveBuild(build);
    
    // Close analysis panel
    if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
    
    // Show success message
    alert(`✅ ${slot} equipped successfully!`);
  });
}

if (btnStore) {
  btnStore.addEventListener('click', () => {
    alert('📦 Gear stored for later consideration.');
    if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
  });
}

if (btnSalvage) {
  btnSalvage.addEventListener('click', () => {
    if (confirm('🗑️ Are you sure you want to salvage this gear?')) {
      alert('🗑️ Gear salvaged for materials.');
      if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
    }
  });
}

// Hook up camera buttons
if (btnOpenCam) {
  btnOpenCam.textContent = 'Check New Gear';
  btnOpenCam.addEventListener('click', openCamera);
}

if (btnCapture) {
  btnCapture.addEventListener('click', captureFrame);
}

if (btnCancelCam) {
  btnCancelCam.addEventListener('click', () => {
    stopCamera();
    if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
  });
}
