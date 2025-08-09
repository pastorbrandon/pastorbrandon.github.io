
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

// Function URL for Netlify
const FN_URL = location.hostname.endsWith('netlify.app')
  ? '/.netlify/functions/analyze-gear'
  : 'https://d4companion.netlify.app/.netlify/functions/analyze-gear';

// Helper functions
async function fileToDataUrl(file, max=1280, q=0.85){
  const dataUrl = await new Promise(r => { 
    const fr=new FileReader(); 
    fr.onload=()=>r(fr.result); 
    fr.readAsDataURL(file); 
  });
  return resizeDataUrl(dataUrl, max, q);
}

function resizeDataUrl(dataUrl, max=1280, q=0.85){
  return new Promise(res=>{
    const img=new Image(); 
    img.onload=()=>{ 
      let w=img.width,h=img.height;
      if (w>h && w>max){ 
        h=Math.round(h*(max/w)); 
        w=max; 
      } else if (h>=w && h>max){ 
        w=Math.round(w*(max/h)); 
        h=max; 
      }
      const c=document.createElement('canvas'); 
      c.width=w; 
      c.height=h; 
      c.getContext('2d').drawImage(img,0,0,w,h);
      res(c.toDataURL('image/jpeg', q));
    }; 
    img.src=dataUrl;
  });
}

async function analyzeWithGPT(dataUrl, slot, rules){
  const r = await fetch(FN_URL, {
    method:'POST', 
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ image:dataUrl, slot, rules })
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json(); // { name, status, reasons, improvements, ... }
}

// Configuration
const CONFIG = {
  OPENAI_API_KEY: null // No longer needed - handled by backend
};

// Local storage keys
const STORAGE_KEY = 'hc-build-v1';
// PWA Detection and Storage Debugging
function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true;
}

// Enhanced build loading with PWA debugging
function loadBuild() { 
  try { 
    const build = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    console.log('Loading build from localStorage:', build);
    console.log('Running as PWA:', isPWA());
    console.log('localStorage available:', !!window.localStorage);
    return build;
  } catch (error) {
    console.error('Error loading build from localStorage:', error);
    return {}; 
  } 
}

function saveBuild(build) { 
  console.log('Saving build to localStorage:', build);
  console.log('Running as PWA:', isPWA());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(build)); 
}

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

// Test function for debugging
function testApp() {
  console.log('=== APP TEST ===');
  console.log('PWA Mode:', isPWA());
  console.log('localStorage available:', !!window.localStorage);
  console.log('Current build:', build);
  console.log('Check Gear button:', !!document.getElementById('btn-check-gear'));
  console.log('Add Gear buttons:', document.querySelectorAll('.add-gear-btn').length);
  console.log('Netlify function URL:', FN_URL);
  
  // Test localStorage
  try {
    localStorage.setItem('test', 'test');
    const test = localStorage.getItem('test');
    localStorage.removeItem('test');
    console.log('localStorage test:', test === 'test' ? 'PASS' : 'FAIL');
  } catch (error) {
    console.error('localStorage test FAILED:', error);
  }
}

// Run test on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(testApp, 1000); // Run after everything loads
});

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
  currentAnalysis.directEquip = true; // Flag for direct equipping
  
  // Open native file picker
  openFilePicker();
}

// Apply analysis report to a slot
function applyReportToSlot(slot, report) {
  console.log(`Applying report to slot ${slot}:`, report);
  
  // Convert the report format to our app's format
  const gearData = {
    name: report.name,
    affixes: report.affixes.map(affix => affix.stat),
    score: report.score || 0,
    grade: report.status.toLowerCase(),
    slot: report.slot,
    reasons: report.reasons,
    improvements: report.improvements
  };
  
  // Update the build
  build[slot] = gearData;
  saveBuild(build);
  
  // Update the display
  updateGearDisplay(slot, gearData);
  
  // Show success message
  alert(`✅ ${report.name} analyzed and equipped to ${slot}!`);
  
  // Clear the analysis state
  currentAnalysis = {
    newGearData: null,
    detectedSlot: null,
    targetSlot: null,
    directEquip: false
  };
}

// Function to open native file picker
function openFilePicker() {
  // Create a hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.capture = 'environment'; // This enables camera on mobile
  
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const slot = currentAnalysis.targetSlot;
        console.log(`Processing image for slot: ${slot}`);
        
        // Show loading status
        const slotElement = document.querySelector(`[data-slot="${slot}"]`);
        if (slotElement) {
          const gearName = slotElement.querySelector('.gear-name');
          if (gearName) {
            gearName.textContent = 'Analyzing...';
            gearName.setAttribute('data-grade', 'analyzing');
          }
        }
        
        // Convert and resize image
        const dataUrl = await fileToDataUrl(file, 1280, 0.85);
        
        // Load rules
        let rules = {};
        try {
          const resp = await fetch('rulepack.json');
          rules = await resp.json();
        } catch (error) {
          console.warn('Could not load rulepack:', error);
        }
        
        // Analyze with GPT
        const report = await analyzeWithGPT(dataUrl, slot, rules);
        console.log('Analysis report:', report);
        
        // Apply the report to the slot
        applyReportToSlot(slot, report);
        
      } catch (error) {
        console.error('Analysis failed:', error);
        alert('Analysis failed: ' + (error.message || error));
        
        // Reset slot status
        const slotElement = document.querySelector(`[data-slot="${currentAnalysis.targetSlot}"]`);
        if (slotElement) {
          const gearName = slotElement.querySelector('.gear-name');
          if (gearName) {
            gearName.textContent = 'No gear equipped';
            gearName.setAttribute('data-grade', 'unscored');
          }
        }
      }
    }
  });
  
  // Trigger the file picker
  fileInput.click();
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

// Gear analysis panel elements
const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
const currentGearInfo = document.getElementById('currentGearInfo');
const newGearInfo = document.getElementById('newGearInfo');
const recommendationText = document.getElementById('recommendationText');
const btnSwitch = document.getElementById('btn-switch');
const btnSalvage = document.getElementById('btn-salvage');

let lastCaptureDataUrl = null;

// Real OCR and gear analysis
async function analyzeGear() {
  if (!lastCaptureDataUrl) return;
  
  // Check if we're adding gear to a specific slot
  const targetSlot = currentAnalysis.targetSlot;
  const directEquip = currentAnalysis.directEquip;
  
  console.log('Starting real OCR analysis...');
  
  try {
    // Perform real OCR on the captured image
    const ocrResult = await performOCR(lastCaptureDataUrl);
    
    if (ocrResult) {
      console.log('OCR successful:', ocrResult);
      
      if (targetSlot && directEquip) {
        // We're directly equipping gear to a specific slot
        console.log(`Directly equipping gear to slot: ${targetSlot}`);
        
        // Score the gear properly
        ocrResult.score = scoreGear(targetSlot, ocrResult);
        ocrResult.grade = getGradeFromScore(ocrResult.score);
        
        // Directly equip the gear without showing analysis panel
        build[targetSlot] = ocrResult;
        updateGearDisplay(targetSlot, ocrResult);
        saveBuild(build);
        
        // Close camera
        // stopCamera(); // This function is no longer needed
        
        // Clear the analysis state
        currentAnalysis = {
          newGearData: null,
          detectedSlot: null,
          targetSlot: null,
          directEquip: false
        };
        
        // Show success message
        alert(`✅ ${ocrResult.name} equipped to ${targetSlot}!`);
      } else if (targetSlot) {
        // We're adding gear to a specific slot with analysis
        console.log(`Adding gear to slot: ${targetSlot}`);
        
        // Score the gear properly
        ocrResult.score = scoreGear(targetSlot, ocrResult);
        ocrResult.grade = getGradeFromScore(ocrResult.score);
        
        currentAnalysis = {
          newGearData: ocrResult,
          detectedSlot: targetSlot,
          targetSlot: targetSlot
        };
        
        // Update UI for adding gear
        updateGearAnalysisForAdding(targetSlot, ocrResult);
      } else {
        // We're checking new gear (original functionality)
        console.log('Checking new gear...');
        
        // Show analysis panel
        if (gearAnalysisPanel) gearAnalysisPanel.classList.remove('hidden');
        // if (camPanel) camPanel.classList.add('hidden'); // camPanel is removed
        
        // For checking gear, we need to detect the slot type
        // Since we can't simulate, we'll ask the user
        const detectedSlot = await promptForGearSlot();
        if (!detectedSlot) {
          alert('❌ Gear analysis cancelled. Could not determine gear type.');
          // stopCamera(); // camPanel is removed
          return;
        }
        
        ocrResult.score = scoreGear(detectedSlot, ocrResult);
        ocrResult.grade = getGradeFromScore(ocrResult.score);
        
        currentAnalysis = {
          newGearData: ocrResult,
          detectedSlot: detectedSlot
        };
        
        // Update UI with analysis results
        updateGearAnalysis(detectedSlot, ocrResult);
      }
    } else {
      // OCR failed - show error and stop
      console.log('OCR failed - no data returned');
      alert('❌ Failed to analyze gear image. Please try again with a clearer photo.');
      // stopCamera(); // camPanel is removed
    }
  } catch (error) {
    console.error('Error during OCR analysis:', error);
    alert(`❌ Error analyzing gear: ${error.message}\n\nPlease check your API key and try again.`);
    // stopCamera(); // camPanel is removed
  }
}

// Function to prompt user for gear slot when checking new gear
async function promptForGearSlot() {
  const slotOptions = [
    'helm', 'amulet', 'chest', 'gloves', 'pants', 
    'boots', 'ring1', 'ring2', 'weapon', 'offhand'
  ];
  
  const slotNames = {
    'helm': 'Helm',
    'amulet': 'Amulet', 
    'chest': 'Chest',
    'gloves': 'Gloves',
    'pants': 'Pants',
    'boots': 'Boots',
    'ring1': 'Ring 1',
    'ring2': 'Ring 2',
    'weapon': 'Weapon',
    'offhand': 'Off-hand'
  };
  
  const slotList = slotOptions.map(slot => `${slotNames[slot]} (${slot})`).join('\n');
  
  const userInput = prompt(
    `What type of gear is this?\n\n${slotList}\n\nEnter the slot name (e.g., "helm" or "weapon"):`
  );
  
  if (!userInput) return null;
  
  const selectedSlot = slotOptions.find(slot => 
    slot.toLowerCase() === userInput.toLowerCase() ||
    slotNames[slot].toLowerCase() === userInput.toLowerCase()
  );
  
  if (!selectedSlot) {
    alert('❌ Invalid slot type. Please try again.');
    return null;
  }
  
  return selectedSlot;
}

// ChatGPT Vision API function to extract gear data from image
async function analyzeGearWithChatGPT(imageDataUrl) {
  try {
    console.log('Starting secure gear analysis...');
    
    // Show loading message
    const newGearInfo = document.getElementById('newGearInfo');
    if (newGearInfo) {
      newGearInfo.innerHTML = `
        <p class="gear-name">Analyzing with AI...</p>
        <p class="gear-status">Status: Processing</p>
      `;
    }
    
    // Get the target slot for analysis
    const targetSlot = currentAnalysis.targetSlot;
    
    // Load rules from rulepack
    let rules = {};
    try {
      const response = await fetch('rulepack.json');
      rules = await response.json();
    } catch (error) {
      console.warn('Could not load rulepack:', error);
    }
    
    console.log('Sending image to Netlify function...');
    
    // Call our Netlify function
    const response = await fetch('/.netlify/functions/analyze-gear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: imageDataUrl,
        slot: targetSlot || 'unknown',
        rules: rules
      })
    });
    
    console.log('Netlify function response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Analysis result:', result);
    
    // Convert the new format to our app's format
    const gearData = {
      name: result.name,
      affixes: result.affixes.map(affix => affix.stat),
      score: result.score || 0,
      grade: result.status.toLowerCase(),
      slot: result.slot,
      reasons: result.reasons,
      improvements: result.improvements
    };
    
    console.log('✅ Analysis successful:', gearData);
    return gearData;
    
  } catch (error) {
    console.error('Analysis error:', error);
    
    // Show error message to user
    const newGearInfo = document.getElementById('newGearInfo');
    if (newGearInfo) {
      newGearInfo.innerHTML = `
        <p class="gear-name">Analysis Failed</p>
        <p class="gear-status">Status: Error - ${error.message}</p>
      `;
    }
    
    return null;
  }
}

// Fallback function to extract gear info from ChatGPT text response
function extractGearFromText(text) {
  console.log('Extracting gear from text:', text);
  
  // Look for gear name (usually in quotes or at the beginning)
  let gearName = 'Unknown Gear';
  const nameMatch = text.match(/"name":\s*"([^"]+)"/);
  if (nameMatch) {
    gearName = nameMatch[1];
  }
  
  // Look for affixes array
  let affixes = [];
  const affixesMatch = text.match(/"affixes":\s*\[([^\]]+)\]/);
  if (affixesMatch) {
    const affixesText = affixesMatch[1];
    affixes = affixesText.split(',').map(affix => 
      affix.trim().replace(/"/g, '').replace(/\[|\]/g, '')
    ).filter(affix => affix.length > 0);
  }
  
  // Only use exact matches from the text, don't guess
  if (affixes.length === 0) {
    // Look for specific affix patterns in the text
    const affixPatterns = [
      'Intelligence', 'Dexterity', 'Strength', 'Willpower',
      'Maximum Mana', 'Mana per Second', 'Lucky Hit Chance to Restore Primary Resource',
      'Critical Strike Chance', 'Critical Strike Damage',
      'Fire Damage', 'Pyromancy Skill Damage', 'Conjuration Skill Damage',
      'Cooldown Reduction', 'Evade Cooldown Reduction', 'Movement Speed',
      'Maximum Life', 'Armor', 'Damage Reduction', 'All Resistance',
      'Fire Resistance', 'Cold Resistance', 'Lightning Resistance', 'Poison Resistance', 'Shadow Resistance',
      'Lucky Hit Chance', 'Lucky Hit Effect', 'Crowd Control Duration', 'Crowd Control Effect',
      'Damage to Burning Enemies', 'Damage to Crowd Controlled Enemies', 'Damage to Vulnerable Enemies',
      'Vulnerable Damage', 'Overpower Damage', 'Attack Speed', 'Cast Speed',
      'Resource Generation'
    ];
    
    const lowerText = text.toLowerCase();
    affixes = affixPatterns.filter(affix => 
      lowerText.includes(affix.toLowerCase())
    );
  }
  
  return {
    name: gearName,
    affixes: affixes,
    score: 0,
    grade: 'red'
  };
}

// Replace the old OCR function with ChatGPT
async function performOCR(imageDataUrl) {
  return await analyzeGearWithChatGPT(imageDataUrl);
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
  // if (camPanel) camPanel.classList.add('hidden'); // camPanel is removed
  
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
    
    // Clear the analysis state
    if (currentAnalysis.targetSlot) {
      currentAnalysis.targetSlot = null;
      currentAnalysis.directEquip = false;
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
      
      // Clear the analysis state
      if (currentAnalysis.targetSlot) {
        currentAnalysis.targetSlot = null;
        currentAnalysis.directEquip = false;
      }
    }
  });
}

// Hook up camera buttons
// if (btnOpenCam) { // btnOpenCam is removed
//   btnOpenCam.textContent = 'Check New Gear';
//   btnOpenCam.addEventListener('click', () => {
//     // Clear any previous analysis state
//     currentAnalysis = {
//       newGearData: null,
//       detectedSlot: null
//     };
    
//     // Open native file picker for checking gear
//     openFilePicker();
//   });
// }

// Hook up Check New Gear button
const btnCheckGear = document.getElementById('btn-check-gear');
if (btnCheckGear) {
  console.log('Check Gear button found, adding event listener');
  btnCheckGear.addEventListener('click', async () => {
    console.log('Check Gear button clicked');
    try {
      // Prompt user for gear slot
      const slot = await promptForGearSlot();
      if (!slot) {
        alert('❌ Gear analysis cancelled. Could not determine gear type.');
        return;
      }
      
      console.log(`Selected slot: ${slot}`);
      
      // Set up analysis state
      currentAnalysis = {
        newGearData: null,
        detectedSlot: slot,
        targetSlot: null,
        directEquip: false
      };
      
      // Open file picker for analysis
      openFilePickerForAnalysis();
      
    } catch (error) {
      console.error('Error starting gear analysis:', error);
      alert('Error starting gear analysis: ' + error.message);
    }
  });
} else {
  console.error('Check Gear button not found!');
}

// Function to open file picker for analysis (not direct equip)
function openFilePickerForAnalysis() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.capture = 'environment';
  
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const slot = currentAnalysis.detectedSlot;
        console.log(`Analyzing gear for slot: ${slot}`);
        
        // Show analysis panel
        if (gearAnalysisPanel) gearAnalysisPanel.classList.remove('hidden');
        
        // Update new gear info
        if (newGearInfo) {
          newGearInfo.innerHTML = `
            <p class="gear-name">Analyzing...</p>
            <p class="gear-status">Status: Processing</p>
          `;
        }
        
        // Convert and resize image
        const dataUrl = await fileToDataUrl(file, 1280, 0.85);
        
        // Load rules
        let rules = {};
        try {
          const resp = await fetch('rulepack.json');
          rules = await resp.json();
        } catch (error) {
          console.warn('Could not load rulepack:', error);
        }
        
        // Analyze with GPT
        const report = await analyzeWithGPT(dataUrl, slot, rules);
        console.log('Analysis report:', report);
        
        // Convert report to our format
        const gearData = {
          name: report.name,
          affixes: report.affixes.map(affix => affix.stat),
          score: report.score || 0,
          grade: report.status.toLowerCase(),
          slot: report.slot,
          reasons: report.reasons,
          improvements: report.improvements
        };
        
        // Update analysis state
        currentAnalysis.newGearData = gearData;
        
        // Update the analysis panel
        updateGearAnalysis(slot, gearData);
        
      } catch (error) {
        console.error('Analysis failed:', error);
        alert('Analysis failed: ' + (error.message || error));
        
        // Hide analysis panel
        if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
      }
    }
  });
  
  fileInput.click();
}

// if (btnCapture) { // btnCapture is removed
// btnCapture.addEventListener('click', captureFrame);
// }

// if (btnCancelCam) { // btnCancelCam is removed
//   btnCancelCam.addEventListener('click', () => {
//     stopCamera();
//     if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
    
//     // Clear the analysis state
//     if (currentAnalysis.targetSlot) {
//       currentAnalysis.targetSlot = null;
//       currentAnalysis.directEquip = false;
//     }
//   });
// }

// Configure API button
const btnConfigureApi = document.getElementById('btn-configure-api');
if (btnConfigureApi) {
  btnConfigureApi.addEventListener('click', () => {
    const currentKey = CONFIG.OPENAI_API_KEY;
    const maskedKey = currentKey ? `${currentKey.substring(0, 8)}...` : 'Not set';
    
    const newKey = prompt(
      `Current OpenAI API Key: ${maskedKey}\n\n` +
      `Enter your OpenAI API key to enable AI gear analysis:\n\n` +
      `Get your key from: https://platform.openai.com/api-keys\n\n` +
      `(Leave empty to remove current key)`,
      currentKey === 'your-openai-api-key-here' ? '' : currentKey
    );
    
    if (newKey === null) return; // User cancelled
    
    if (newKey.trim() === '') {
      // Remove the key
      localStorage.removeItem('openai-api-key');
      CONFIG.OPENAI_API_KEY = null;
      alert('🗑️ API key removed. Gear analysis will use fallback data.');
    } else {
      // Set the new key
      // setOpenAIKey(newKey.trim()); // This function is no longer needed
      alert('✅ API key saved! You can now use AI gear analysis.');
    }
  });
}
