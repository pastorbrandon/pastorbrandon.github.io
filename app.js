
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
  newGearData: null,
  detectedSlot: null
};

// Force hide modal immediately
console.log('Script starting - forcing modal to be hidden...');
setTimeout(() => {
  const gearModal = document.getElementById('gearModal');
  if (gearModal) {
    gearModal.classList.add('hidden');
    gearModal.style.display = 'none';
    console.log('Modal forced hidden on script start');
  }
}, 0);

// Wait for DOM to be ready before initializing modal
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing modal...');
  
  // Debug: Check if there's any saved build data
  console.log('Current build data:', build);
  
  // Check if any slots have gear data
  const slotsWithGear = SLOTS.filter(slot => build[slot]);
  console.log('Slots with gear data:', slotsWithGear);
  
  // Modal elements
  const gearModal = document.getElementById('gearModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalGearName = document.getElementById('modalGearName');
  const modalGearStats = document.getElementById('modalGearStats');
  const modalGearGrade = document.getElementById('modalGearGrade');
  const modalImprovement = document.getElementById('modalImprovement');
  const closeModal = document.getElementById('closeModal');

  console.log('Modal elements found:', {
    gearModal: !!gearModal,
    modalTitle: !!modalTitle,
    modalGearName: !!modalGearName,
    modalGearStats: !!modalGearStats,
    modalGearGrade: !!modalGearGrade,
    modalImprovement: !!modalImprovement,
    closeModal: !!closeModal
  });

  // Ensure modal is hidden on page load - multiple approaches
  if (gearModal) {
    gearModal.classList.add('hidden');
    gearModal.style.display = 'none';
    console.log('Modal hidden on page load');
  }

  // Close modal function
  function closeGearModal() {
    console.log('Closing modal...');
    if (gearModal) {
      gearModal.classList.add('hidden');
      gearModal.style.display = 'none';
      console.log('Modal closed');
    }
  }

  // Set up modal close handlers
  if (closeModal) {
    closeModal.addEventListener('click', (e) => {
      console.log('Close button clicked');
      e.preventDefault();
      e.stopPropagation();
      closeGearModal();
    });
    console.log('Close button event listener added');
  }

  // Close modal when clicking outside
  if (gearModal) {
    gearModal.addEventListener('click', (e) => {
      if (e.target === gearModal) {
        console.log('Clicked outside modal, closing...');
        closeGearModal();
      }
    });
    console.log('Modal outside click handler added');
  }

  // Initialize paper doll with click handlers
  SLOTS.forEach(slot => {
    const slotEl = document.querySelector(`.slot[data-slot="${slot}"]`);
    if (!slotEl) return;
    
    // Load existing gear data
    const gearData = build[slot];
    if (gearData) {
      updateGearDisplay(slot, gearData);
    }
    
    // Add click handler for modal (only if gear exists)
    const gearNameEl = slotEl.querySelector('.gear-name');
    if (gearNameEl) {
      gearNameEl.addEventListener('click', () => {
        console.log(`Gear name clicked for slot: ${slot}, has gear data:`, !!build[slot]);
        if (build[slot]) {
          showGearModal(slot);
        }
      });
    }
    
    // Add click handler for Add Gear button
    const addGearBtn = slotEl.querySelector('.add-gear-btn');
    if (addGearBtn) {
      addGearBtn.addEventListener('click', () => {
        addGearManually(slot);
      });
    }
  });

  console.log('Paper doll initialization complete');
});

// Also force hide modal on window load
window.addEventListener('load', () => {
  console.log('Window loaded - ensuring modal is hidden...');
  const gearModal = document.getElementById('gearModal');
  if (gearModal) {
    gearModal.classList.add('hidden');
    gearModal.style.display = 'none';
    console.log('Modal hidden on window load');
  }
});

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

function getGradeFromScore(score) {
  if (score >= 90) return 'blue';
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function updateGearDisplay(slot, gearData) {
  const slotEl = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!slotEl) return;
  
  const gearNameEl = slotEl.querySelector('.gear-name');
  if (!gearNameEl) return;
  
  if (gearData) {
    gearNameEl.textContent = gearData.name;
    gearNameEl.setAttribute('data-grade', gearData.grade);
  } else {
    gearNameEl.textContent = 'No gear equipped';
    gearNameEl.setAttribute('data-grade', 'unscored');
  }
}

// Modal functionality
function showGearModal(slot) {
  console.log('showGearModal called for slot:', slot);
  const gearData = build[slot];
  if (!gearData) {
    console.log('No gear data for slot:', slot);
    return;
  }
  
  console.log('Gear data found:', gearData);
  
  const gearModal = document.getElementById('gearModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalGearName = document.getElementById('modalGearName');
  const modalGearStats = document.getElementById('modalGearStats');
  const modalGearGrade = document.getElementById('modalGearGrade');
  const modalImprovement = document.getElementById('modalImprovement');
  
  if (!gearModal || !modalTitle || !modalGearName || !modalGearStats || !modalGearGrade) {
    console.error('Modal elements not found');
    return;
  }
  
  modalTitle.textContent = `${slot.charAt(0).toUpperCase() + slot.slice(1)} Details`;
  modalGearName.textContent = gearData.name;
  modalGearName.className = `modal-gear-name ${gearData.grade}`;
  
  // Display gear stats
  modalGearStats.innerHTML = `
    <h4>Affixes:</h4>
    <ul>
      ${gearData.affixes.map(affix => `<li>${affix}</li>`).join('')}
    </ul>
  `;
  
  // Display grade
  const gradeText = gearData.grade === 'blue' ? 'BiS (Best in Slot)' :
                   gearData.grade === 'green' ? 'Good (Keep & Improve)' :
                   gearData.grade === 'yellow' ? 'Viable' : 'Replace';
  
  modalGearGrade.textContent = `Grade: ${gradeText} (${gearData.score}/100)`;
  modalGearGrade.className = `modal-gear-grade ${gearData.grade}`;
  
  // Show improvement suggestions for non-blue gear
  if (gearData.grade !== 'blue') {
    showImprovementSuggestions(slot, gearData);
  } else {
    modalImprovement.classList.add('hidden');
  }
  
  gearModal.classList.remove('hidden');
  gearModal.style.display = 'block';
  console.log('Modal shown');
}

function showImprovementSuggestions(slot, gearData) {
  try {
    const modalImprovement = document.getElementById('modalImprovement');
    if (!modalImprovement) return;
    
    const rules = JSON.parse(localStorage.getItem('rulepack-cache') || '{}');
    const slotRules = rules.slots && rules.slots[slot.charAt(0).toUpperCase() + slot.slice(1)];
    
    if (!slotRules) {
      modalImprovement.classList.add('hidden');
      return;
    }
    
    const missingMandatory = slotRules.mandatoryAffixes.filter(affix => 
      !gearData.affixes.some(g => g.toLowerCase().includes(affix.toLowerCase()))
    );
    
    const missingPreferred = slotRules.preferredAffixes.filter(affix => 
      !gearData.affixes.some(g => g.toLowerCase().includes(affix.toLowerCase()))
    );
    
    let improvementHtml = '<h4>How to get to Blue:</h4><ul>';
    
    if (missingMandatory.length > 0) {
      improvementHtml += '<li><strong>Missing Mandatory Affixes:</strong></li>';
      missingMandatory.forEach(affix => {
        improvementHtml += `<li>• ${affix}</li>`;
      });
    }
    
    if (missingPreferred.length > 0) {
      improvementHtml += '<li><strong>Missing Preferred Affixes:</strong></li>';
      missingPreferred.forEach(affix => {
        improvementHtml += `<li>• ${affix}</li>`;
      });
    }
    
    improvementHtml += '</ul>';
    modalImprovement.innerHTML = improvementHtml;
    modalImprovement.classList.remove('hidden');
    
  } catch (error) {
    console.error('Error showing improvements:', error);
    const modalImprovement = document.getElementById('modalImprovement');
    if (modalImprovement) {
      modalImprovement.classList.add('hidden');
    }
  }
}

// Function to manually add gear
function addGearManually(slot) {
  console.log(`Adding gear for slot: ${slot}`);
  
  // Store the target slot for when we capture the image
  currentAnalysis.targetSlot = slot;
  
  // Open camera for gear capture
  openCamera();
}

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
    if (!confirm('Clear saved build data & notes?')) return;
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
const currentGearInfo = document.getElementById('currentGearInfo');
const newGearInfo = document.getElementById('newGearInfo');
const recommendationText = document.getElementById('recommendationText');
const btnSwitch = document.getElementById('btn-switch');
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
  
  // Check if we're adding gear to a specific slot
  const targetSlot = currentAnalysis.targetSlot;
  
  if (targetSlot) {
    // We're adding gear to a specific slot
    console.log(`Adding gear to slot: ${targetSlot}`);
    
    // Simulate OCR analysis for the target slot
    setTimeout(() => {
      const newGearData = generateGearData(targetSlot);
      
      currentAnalysis = {
        newGearData: newGearData,
        detectedSlot: targetSlot,
        targetSlot: targetSlot
      };
      
      // Update UI for adding gear
      updateGearAnalysisForAdding(targetSlot, newGearData);
    }, 1500);
  } else {
    // We're checking new gear (original functionality)
    console.log('Checking new gear...');
    
    // Show analysis panel
    if (gearAnalysisPanel) gearAnalysisPanel.classList.remove('hidden');
    if (camPanel) camPanel.classList.add('hidden');
    
    // Simulate OCR analysis
    setTimeout(() => {
      const detectedSlot = simulateGearDetection();
      const newGearData = generateGearData(detectedSlot);
      
      currentAnalysis = {
        newGearData: newGearData,
        detectedSlot: detectedSlot
      };
      
      // Update UI with analysis results
      updateGearAnalysis(detectedSlot, newGearData);
    }, 1500);
  }
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
    grade: 'red'
  };
  
  // Score the gear properly
  gearData.score = scoreGear(slot, gearData);
  gearData.grade = getGradeFromScore(gearData.score);
  
  return gearData;
}

// Update gear analysis UI
function updateGearAnalysis(detectedSlot, newGearData) {
  // Update current gear info
  const currentGear = build[detectedSlot];
  if (currentGearInfo) {
    if (currentGear) {
      currentGearInfo.innerHTML = `
        <p class="gear-name">${currentGear.name}</p>
        <p class="gear-status">Status: ${currentGear.grade} (${currentGear.score}/100)</p>
      `;
    } else {
      currentGearInfo.innerHTML = `
        <p class="gear-name">No gear equipped</p>
        <p class="gear-status">Status: —</p>
      `;
    }
  }
  
  // Update new gear info
  if (newGearInfo) {
    newGearInfo.innerHTML = `
      <p class="gear-name">${newGearData.name}</p>
      <p class="gear-status">Status: ${newGearData.grade} (${newGearData.score}/100)</p>
    `;
  }
  
  // Generate recommendation
  const recommendation = generateRecommendation(detectedSlot, newGearData);
  if (recommendationText) {
    recommendationText.textContent = recommendation.text;
  }
  
  // Enable/disable buttons based on recommendation
  if (btnSwitch) btnSwitch.disabled = !recommendation.canSwitch;
  if (btnSalvage) btnSalvage.disabled = !recommendation.canSalvage;
}

// Generate recommendation logic
function generateRecommendation(slot, newGearData) {
  const currentGear = build[slot];
  const currentScore = currentGear ? (currentGear.score || 0) : 0;
  const newScore = newGearData.score;
  
  if (newScore >= 90) {
    return {
      text: `Excellent ${slot}! This is BiS material. Strongly recommend switching.`,
      canSwitch: true,
      canSalvage: false
    };
  } else if (newScore >= 70) {
    if (newScore > currentScore + 10) {
      return {
        text: `Good ${slot} with better stats than current. Recommend switching.`,
        canSwitch: true,
        canSalvage: false
      };
    } else {
      return {
        text: `Decent ${slot}, but current gear is better. Consider keeping current.`,
        canSwitch: false,
        canSalvage: false
      };
    }
  } else if (newScore >= 50) {
    return {
      text: `Mediocre ${slot}. Only switch if current gear is worse.`,
      canSwitch: newScore > currentScore,
      canSalvage: false
    };
  } else {
    return {
      text: `Poor ${slot}. Recommend salvaging for materials.`,
      canSwitch: false,
      canSalvage: true
    };
  }
}

// Update gear analysis UI for adding gear
function updateGearAnalysisForAdding(targetSlot, newGearData) {
  console.log(`Updating UI for adding gear to ${targetSlot}:`, newGearData);
  
  // Show analysis panel
  if (gearAnalysisPanel) gearAnalysisPanel.classList.remove('hidden');
  if (camPanel) camPanel.classList.add('hidden');
  
  // Update current gear info (will be "No gear equipped" for new slots)
  const currentGear = build[targetSlot];
  if (currentGearInfo) {
    if (currentGear) {
      currentGearInfo.innerHTML = `
        <p class="gear-name">${currentGear.name}</p>
        <p class="gear-status">Status: ${currentGear.grade} (${currentGear.score}/100)</p>
      `;
    } else {
      currentGearInfo.innerHTML = `
        <p class="gear-name">No gear equipped</p>
        <p class="gear-status">Status: —</p>
      `;
    }
  }
  
  // Update new gear info
  if (newGearInfo) {
    newGearInfo.innerHTML = `
      <p class="gear-name">${newGearData.name}</p>
      <p class="gear-status">Status: ${newGearData.grade} (${newGearData.score}/100)</p>
    `;
  }
  
  // Generate recommendation for adding gear
  const recommendation = generateRecommendationForAdding(targetSlot, newGearData);
  if (recommendationText) {
    recommendationText.textContent = recommendation.text;
  }
  
  // Enable/disable buttons based on recommendation
  if (btnSwitch) btnSwitch.disabled = !recommendation.canSwitch;
  if (btnSalvage) btnSalvage.disabled = !recommendation.canSalvage;
}

// Generate recommendation logic for adding gear
function generateRecommendationForAdding(slot, newGearData) {
  const currentGear = build[slot];
  const currentScore = currentGear ? (currentGear.score || 0) : 0;
  const newScore = newGearData.score;
  
  if (newScore >= 90) {
    return {
      text: `Excellent ${slot}! This is BiS material. Strongly recommend adding.`,
      canSwitch: true,
      canSalvage: false
    };
  } else if (newScore >= 70) {
    if (newScore > currentScore + 10) {
      return {
        text: `Good ${slot} with better stats than current. Recommend adding.`,
        canSwitch: true,
        canSalvage: false
      };
    } else {
      return {
        text: `Decent ${slot}, but current gear is better. Consider keeping current.`,
        canSwitch: false,
        canSalvage: false
      };
    }
  } else if (newScore >= 50) {
    return {
      text: `Mediocre ${slot}. Only add if current gear is worse.`,
      canSwitch: newScore > currentScore,
      canSalvage: false
    };
  } else {
    return {
      text: `Poor ${slot}. Recommend salvaging for materials.`,
      canSwitch: false,
      canSalvage: true
    };
  }
}

// Handle gear action buttons
if (btnSwitch) {
  btnSwitch.addEventListener('click', () => {
    if (!currentAnalysis.detectedSlot || !currentAnalysis.newGearData) return;
    
    const slot = currentAnalysis.detectedSlot;
    const gearData = currentAnalysis.newGearData;
    
    // Update build with new gear
    build[slot] = gearData;
    
    // Update paper doll display
    updateGearDisplay(slot, gearData);
    
    saveBuild(build);
    
    // Close analysis panel
    if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
    
    // Clear the target slot if we were adding gear
    if (currentAnalysis.targetSlot) {
      currentAnalysis.targetSlot = null;
    }
    
    // Show success message
    const action = currentAnalysis.targetSlot ? 'added to' : 'switched';
    alert(`✅ ${slot} ${action} successfully!`);
  });
}

if (btnSalvage) {
  btnSalvage.addEventListener('click', () => {
    if (confirm('🗑️ Are you sure you want to salvage this gear?')) {
      alert('🗑️ Gear salvaged for materials.');
      if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
      
      // Clear the target slot if we were adding gear
      if (currentAnalysis.targetSlot) {
        currentAnalysis.targetSlot = null;
      }
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
    
    // Clear the target slot if we were adding gear
    if (currentAnalysis.targetSlot) {
      currentAnalysis.targetSlot = null;
    }
  });
}
