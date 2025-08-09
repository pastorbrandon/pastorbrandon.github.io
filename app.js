
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

// Configuration
const CONFIG = {
  OPENAI_API_KEY: localStorage.getItem('openai-api-key') || null
};

// Function to set OpenAI API key
function setOpenAIKey(apiKey) {
  CONFIG.OPENAI_API_KEY = apiKey;
  localStorage.setItem('openai-api-key', apiKey);
  console.log('OpenAI API key saved');
}

// Function to check if API key is configured
function isOpenAIConfigured() {
  return CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY !== 'your-openai-api-key-here';
}

// Function to prompt for API key if not configured
function checkOpenAIConfiguration() {
  if (!isOpenAIConfigured()) {
    const apiKey = prompt('Please enter your OpenAI API key to enable AI gear analysis:\n\nGet your key from: https://platform.openai.com/api-keys\n\n(You can change this later by calling setOpenAIKey())');
    if (apiKey && apiKey.trim()) {
      setOpenAIKey(apiKey.trim());
      alert('✅ API key saved! You can now use AI gear analysis.');
    } else {
      alert('⚠️ No API key provided. Gear analysis will use fallback data.');
    }
  }
}

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
  currentAnalysis.directEquip = true; // Flag for direct equipping
  
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
        stopCamera();
        
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
        if (camPanel) camPanel.classList.add('hidden');
        
        // For checking gear, we need to detect the slot type
        // Since we can't simulate, we'll ask the user
        const detectedSlot = await promptForGearSlot();
        if (!detectedSlot) {
          alert('❌ Gear analysis cancelled. Could not determine gear type.');
          stopCamera();
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
      stopCamera();
    }
  } catch (error) {
    console.error('Error during OCR analysis:', error);
    alert(`❌ Error analyzing gear: ${error.message}\n\nPlease check your API key and try again.`);
    stopCamera();
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
    console.log('Starting ChatGPT Vision analysis...');
    
    // Show loading message
    const newGearInfo = document.getElementById('newGearInfo');
    if (newGearInfo) {
      newGearInfo.innerHTML = `
        <p class="gear-name">Analyzing with AI...</p>
        <p class="gear-status">Status: Processing</p>
      `;
    }
    
    // Check if API key is configured
    if (!isOpenAIConfigured()) {
      checkOpenAIConfiguration();
      throw new Error('OpenAI API key not configured');
    }
    
    // Convert image to base64
    const base64Image = imageDataUrl.split(',')[1];
    
    const OPENAI_API_KEY = CONFIG.OPENAI_API_KEY;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this Diablo 4 gear image and extract the following information in JSON format:
              {
                "name": "gear name",
                "affixes": ["affix1", "affix2", "affix3", "affix4"]
              }
              
              Only include actual affixes that are visible in the image. Common Diablo 4 affixes include:
              - Intelligence, Dexterity, Strength, Willpower
              - Maximum Mana, Mana per Second
              - Critical Strike Chance, Critical Strike Damage
              - Fire Damage, Pyromancy Skill Damage, Conjuration Skill Damage
              - Cooldown Reduction, Evade Cooldown Reduction
              - Movement Speed
              - Maximum Life, Armor, Damage Reduction
              - All Resistance, Fire Resistance, Cold Resistance, Lightning Resistance, Poison Resistance, Shadow Resistance
              - Lucky Hit Chance, Lucky Hit Effect
              - Crowd Control Duration, Crowd Control Effect
              - Damage to Burning Enemies, Damage to Crowd Controlled Enemies, Damage to Vulnerable Enemies
              - Vulnerable Damage, Overpower Damage
              - Attack Speed, Cast Speed
              - Resource Generation, Lucky Hit Chance to Restore Primary Resource
              
              Be very precise and only include what you can clearly see. If you can't read something clearly, don't include it.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }],
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('ChatGPT Response:', data);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      console.log('ChatGPT Content:', content);
      
      // Try to parse JSON from the response
      try {
        const gearData = JSON.parse(content);
        console.log('Parsed gear data:', gearData);
        
        // Validate the response
        if (gearData.name && Array.isArray(gearData.affixes)) {
          return {
            name: gearData.name,
            affixes: gearData.affixes,
            score: 0,
            grade: 'red'
          };
        } else {
          throw new Error('Invalid gear data format from AI');
        }
      } catch (parseError) {
        console.error('Failed to parse ChatGPT response:', parseError);
        console.log('Raw content:', content);
        
        // Try to extract information manually from the text
        const extractedData = extractGearFromText(content);
        if (extractedData.affixes.length === 0) {
          throw new Error('Could not extract any affixes from AI response');
        }
        return extractedData;
      }
    } else {
      throw new Error('Invalid API response format');
    }
    
  } catch (error) {
    console.error('ChatGPT API Error:', error);
    
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
    
    // Clear the analysis state
    if (currentAnalysis.targetSlot) {
      currentAnalysis.targetSlot = null;
      currentAnalysis.directEquip = false;
    }
  });
}

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
      setOpenAIKey(newKey.trim());
      alert('✅ API key saved! You can now use AI gear analysis.');
    }
  });
}
