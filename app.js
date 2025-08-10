// Global variables
let build = {};
let currentAnalysis = null;

// Utility function to convert file to data URL
async function fileToDataUrl(file, max=1280, q=0.85){
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(max/img.width, max/img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', q));
    };
    img.src = URL.createObjectURL(file);
  });
}

// Utility function to resize data URL
function resizeDataUrl(dataUrl, max=1280, q=0.85){
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(max/img.width, max/img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', q));
    };
    img.src = dataUrl;
  });
}

// Function to analyze gear with GPT
async function analyzeWithGPT(dataUrl, slot, rules) {
  try {
    const response = await fetch('/.netlify/functions/analyze-gear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData: dataUrl,
        slot: slot,
        rules: rules
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error analyzing gear:', error);
    throw error;
  }
}

// Function to validate analysis result
function validateAnalysisResult(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const requiredFields = ['name', 'slot', 'affixes', 'aspect'];
  for (const field of requiredFields) {
    if (!(field in result)) {
      console.error(`Missing required field: ${field}`);
      return false;
    }
  }

  if (!Array.isArray(result.affixes)) {
    console.error('Affixes must be an array');
    return false;
  }

  return true;
}

// Load build from localStorage
function loadBuild() { 
  const saved = localStorage.getItem('hydraSorcererBuild');
  if (saved) {
    try {
      build = JSON.parse(saved);
      console.log('Loaded build data:', build);
    } catch (e) {
      console.error('Error loading build:', e);
      build = {};
    }
  }
}

// Save build to localStorage
function saveBuild(build) { 
  try {
    localStorage.setItem('hydraSorcererBuild', JSON.stringify(build));
    console.log('Build saved successfully');
  } catch (e) {
    console.error('Error saving build:', e);
  }
}

// Function to open file picker for analysis
function openFilePickerForAnalysis() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // Show loading state
      const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
      gearAnalysisPanel.classList.remove('hidden');
      
      // Update loading text
      const recommendationText = document.getElementById('recommendationText');
      recommendationText.textContent = 'Analyzing gear...';

      // Convert file to data URL
      const dataUrl = await fileToDataUrl(file);

      // Load rules from rulepack.json
      const rulesResponse = await fetch('rulepack.json');
      const rulesData = await rulesResponse.json();
      const rules = rulesData.buildRules;

      // Analyze the gear
      const result = await analyzeWithGPT(dataUrl, 'auto', rules);

      if (!validateAnalysisResult(result)) {
        throw new Error('Invalid analysis result received');
      }

      // Update current analysis
      currentAnalysis = {
        slot: result.slot,
        gearData: result,
        imageData: dataUrl
      };

      // Show results
      showAnalysisResults(result);

    } catch (error) {
      console.error('Error during analysis:', error);
      alert('Error analyzing gear: ' + error.message);
      // Hide analysis panel on error
      document.getElementById('gearAnalysisPanel').classList.add('hidden');
    }
  };
  input.click();
}

// Function to open file picker for manual gear entry
function openFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      
      // Show slot selection modal
      showSlotSelectionModal(dataUrl);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing image: ' + error.message);
    }
  };
  input.click();
}

// Function to show slot selection modal
function showSlotSelectionModal(imageData) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('slotModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'slotModal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Select Gear Slot</h3>
          <button class="close-btn" onclick="closeSlotModal()">×</button>
        </div>
        <div class="modal-body">
          <div id="slotOptions" class="slot-options"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const slots = ['helm', 'amulet', 'chest', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
  
  const container = document.getElementById('slotOptions');
  container.innerHTML = '';
  
  slots.forEach(slot => {
    const button = document.createElement('button');
    button.textContent = slot.charAt(0).toUpperCase() + slot.slice(1);
    button.className = 'slot-option-btn';
    button.onclick = () => {
      addGearManually(slot, imageData);
      closeSlotModal();
    };
    container.appendChild(button);
  });
  
  modal.classList.remove('hidden');
}

// Function to close slot modal
function closeSlotModal() {
  const modal = document.getElementById('slotModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Function to add gear manually
function addGearManually(slot, imageData) {
  const gearData = {
    name: 'Manual Entry',
    slot: slot,
    imageData: imageData,
    affixes: [],
    aspect: 'None',
    grade: 'Unknown'
  };
  
  applyReportToSlot(slot, gearData);
}

// Function to apply analysis report to a slot
function applyReportToSlot(slot, report) {
  // Create gear data object
  const gearData = {
    name: report.name || 'Unknown Item',
    slot: slot,
    affixes: report.affixes || [],
    aspect: report.aspect || 'None',
    grade: report.grade || 'Unknown',
    imageData: report.imageData || null,
    analysis: report.analysis || null,
    recommendations: report.recommendations || []
  };

  // Score the gear
  const score = scoreGear(slot, gearData);
  gearData.score = score;
  gearData.grade = getGradeFromScore(score);

  // Add to build
  build[slot] = gearData;
  
  // Save build
  saveBuild(build);
  
  // Update display
  updateGearDisplay(slot, gearData);
  
  // Close modal if open
  window.__hcCloseDetails?.();
  
  // Hide gear analysis panel
  const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
  if (gearAnalysisPanel) {
    gearAnalysisPanel.classList.add('hidden');
  }
  
  console.log(`Applied gear to ${slot}:`, gearData);
}

// Function to score gear based on build rules
function scoreGear(slot, gearData) {
  // Load rules from rulepack.json
  fetch('rulepack.json')
    .then(response => response.json())
    .then(data => {
      const rules = data.buildRules;
      const slotRules = rules[slot] || {};
      
      let score = 0;
      const maxScore = 100;
      
      // Score affixes
      if (gearData.affixes && Array.isArray(gearData.affixes)) {
        gearData.affixes.forEach(affix => {
          if (slotRules.bestAffixes && slotRules.bestAffixes.includes(affix)) {
            score += 25;
          } else if (slotRules.goodAffixes && slotRules.goodAffixes.includes(affix)) {
            score += 15;
          } else if (slotRules.acceptableAffixes && slotRules.acceptableAffixes.includes(affix)) {
            score += 5;
          }
        });
      }
      
      // Score aspect
      if (gearData.aspect && slotRules.bestAspects && slotRules.bestAspects.includes(gearData.aspect)) {
        score += 20;
      } else if (gearData.aspect && slotRules.goodAspects && slotRules.goodAspects.includes(gearData.aspect)) {
        score += 10;
      }
      
      // Cap score at max
      score = Math.min(score, maxScore);
      
      // Update gear data with score
      gearData.score = score;
      gearData.grade = getGradeFromScore(score);
      
      // Update display
      updateGearDisplay(slot, gearData);
    })
    .catch(error => {
      console.error('Error scoring gear:', error);
    });
}

// Function to get grade from score
function getGradeFromScore(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

// Function to update gear display
function updateGearDisplay(slot, gearData) {
  const slotElement = document.querySelector(`[data-slot="${slot}"]`);
  if (!slotElement) return;

  const nameElement = slotElement.querySelector('.gear-name');
  const addButton = slotElement.querySelector('.add-gear-btn');

  if (gearData.name && gearData.name !== 'No gear equipped') {
    nameElement.textContent = gearData.name;
    nameElement.setAttribute('data-grade', gearData.grade ? gearData.grade.toLowerCase() : 'unscored');
    addButton.textContent = 'View Details';
    addButton.onclick = () => showGearModal(slot);
  } else {
    nameElement.textContent = 'No gear equipped';
    nameElement.setAttribute('data-grade', 'unscored');
    addButton.textContent = '+ Add Gear';
    addButton.onclick = () => openFilePicker();
  }
}

// Function to show gear modal
function showGearModal(slot) {
  const gearData = build[slot];
  if (!gearData) return;

  const detailsTitle = document.getElementById('detailsTitle');
  const detailsBody = document.getElementById('detailsBody');

  // Populate modal content
  detailsTitle.textContent = gearData.name;
  
  const gearInfo = {
    name: gearData.name,
    slot: slot,
    grade: gearData.grade || 'Unknown',
    affixes: gearData.affixes || [],
    aspect: gearData.aspect || 'None',
    score: gearData.score || 'N/A'
  };
  
  detailsBody.textContent = JSON.stringify(gearInfo, null, 2);

  // Open the modal using the new system
  window.__hcOpenDetails?.();
}

// Function to close gear modal
function closeGearModal() {
  window.__hcCloseDetails?.();
}

// Function to show analysis results
function showAnalysisResults(result) {
  const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
  const currentGearInfo = document.getElementById('currentGearInfo');
  const newGearInfo = document.getElementById('newGearInfo');
  const recommendationText = document.getElementById('recommendationText');
  const btnSwitch = document.getElementById('btn-switch');
  const btnDiscard = document.getElementById('btn-discard');

  // Show current gear info
  const currentGear = build[result.slot];
  if (currentGear) {
    currentGearInfo.innerHTML = `
      <p class="gear-name">${currentGear.name}</p>
      <p class="gear-status">Status: ${currentGear.grade || 'Unknown'}</p>
      <div class="gear-specs">
        <p>Affixes: ${currentGear.affixes.join(', ')}</p>
        <p>Aspect: ${currentGear.aspect}</p>
      </div>
    `;
  } else {
    currentGearInfo.innerHTML = `
      <p class="gear-name">No gear equipped</p>
      <p class="gear-status">Status: —</p>
      <div class="gear-specs"></div>
    `;
  }

  // Show new gear info
  newGearInfo.innerHTML = `
    <p class="gear-name">${result.name}</p>
    <p class="gear-status">Status: Analyzing...</p>
    <div class="gear-specs">
      <p>Affixes: ${result.affixes.join(', ')}</p>
      <p>Aspect: ${result.aspect}</p>
    </div>
  `;

  // Set up action buttons
  btnSwitch.onclick = () => {
    applyReportToSlot(result.slot, result);
  };
  
  btnDiscard.onclick = () => {
    gearAnalysisPanel.classList.add('hidden');
  };

  // Show recommendation
  recommendationText.textContent = `New ${result.slot} detected: ${result.name}. Click "Switch" to apply or "Discard" to ignore.`;

  gearAnalysisPanel.classList.remove('hidden');
}

// Function to clear build
function clearBuild() {
  if (confirm('Are you sure you want to clear all gear data?')) {
    build = {};
    saveBuild(build);
    
    // Reset all gear displays
    const slots = ['helm', 'amulet', 'chest', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
    slots.forEach(slot => {
      updateGearDisplay(slot, { name: 'No gear equipped' });
    });
    
    // Hide gear analysis panel
    const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
    if (gearAnalysisPanel) {
      gearAnalysisPanel.classList.add('hidden');
    }
    
    console.log('Build cleared');
  }
}

// Function to load and display affix information
async function loadAffixData() {
  try {
    const response = await fetch('rulepack.json');
    const data = await response.json();
    return data.buildRules;
  } catch (error) {
    console.error('Error loading affix data:', error);
    return {};
  }
}

// Function to show affix details for a specific slot
async function showAffixDetails(slot) {
  const affixDetails = document.getElementById('affixDetails');
  const affixSlotTitle = document.getElementById('affixSlotTitle');
  const mandatoryAffixes = document.getElementById('mandatoryAffixes');
  const preferredAffixes = document.getElementById('preferredAffixes');
  const temperingOptions = document.getElementById('temperingOptions');
  const recommendedAspects = document.getElementById('recommendedAspects');
  const enchantmentTargets = document.getElementById('enchantmentTargets');
  const buildNotes = document.getElementById('buildNotes');
  
  // Load affix data
  const affixData = await loadAffixData();
  const slotData = affixData[slot] || {};
  
  // Update title
  affixSlotTitle.textContent = slot.charAt(0).toUpperCase() + slot.slice(1);
  
  // Populate mandatory affixes
  mandatoryAffixes.innerHTML = '';
  if (slotData.mandatoryAffixes && slotData.mandatoryAffixes.length > 0) {
    slotData.mandatoryAffixes.forEach(affix => {
      const affixItem = document.createElement('div');
      affixItem.className = 'affix-item';
      affixItem.innerHTML = `
        <span class="affix-name">${affix}</span>
        <span class="affix-priority">Required</span>
      `;
      mandatoryAffixes.appendChild(affixItem);
    });
  } else {
    mandatoryAffixes.innerHTML = '<p>No mandatory affixes defined</p>';
  }
  
  // Populate preferred affixes
  preferredAffixes.innerHTML = '';
  if (slotData.preferredAffixes && slotData.preferredAffixes.length > 0) {
    slotData.preferredAffixes.forEach(affix => {
      const affixItem = document.createElement('div');
      affixItem.className = 'affix-item';
      affixItem.innerHTML = `
        <span class="affix-name">${affix}</span>
        <span class="affix-priority">Preferred</span>
      `;
      preferredAffixes.appendChild(affixItem);
    });
  } else {
    preferredAffixes.innerHTML = '<p>No preferred affixes defined</p>';
  }
  
  // Populate tempering options
  temperingOptions.innerHTML = '';
  if (slotData.temperingOptions && slotData.temperingOptions.length > 0) {
    slotData.temperingOptions.forEach(option => {
      const affixItem = document.createElement('div');
      affixItem.className = 'affix-item';
      affixItem.innerHTML = `
        <span class="affix-name">${option}</span>
        <span class="affix-priority">Tempering</span>
      `;
      temperingOptions.appendChild(affixItem);
    });
  } else {
    temperingOptions.innerHTML = '<p>No tempering options defined</p>';
  }
  
  // Populate recommended aspects
  recommendedAspects.innerHTML = '';
  if (slotData.bestAspects && slotData.bestAspects.length > 0) {
    slotData.bestAspects.forEach(aspect => {
      const aspectItem = document.createElement('div');
      aspectItem.className = 'aspect-item';
      aspectItem.innerHTML = `
        <div class="aspect-name">${aspect}</div>
        <div class="aspect-desc">Best in slot aspect</div>
      `;
      recommendedAspects.appendChild(aspectItem);
    });
  } else {
    recommendedAspects.innerHTML = '<p>No recommended aspects defined</p>';
  }
  
  // Populate enchantment targets
  enchantmentTargets.innerHTML = '';
  if (slotData.enchantmentTargets && slotData.enchantmentTargets.length > 0) {
    slotData.enchantmentTargets.forEach(target => {
      const enchantmentItem = document.createElement('div');
      enchantmentItem.className = 'enchantment-item';
      enchantmentItem.innerHTML = `
        <span class="enchantment-icon">🔧</span>
        <span class="enchantment-text">${target}</span>
      `;
      enchantmentTargets.appendChild(enchantmentItem);
    });
  } else {
    enchantmentTargets.innerHTML = '<p>No enchantment targets defined</p>';
  }
  
  // Populate build notes
  buildNotes.innerHTML = '';
  if (slotData.notes && slotData.notes.length > 0) {
    slotData.notes.forEach(note => {
      const noteItem = document.createElement('div');
      noteItem.className = 'build-note';
      noteItem.innerHTML = `
        <div class="build-note-content">${note}</div>
      `;
      buildNotes.appendChild(noteItem);
    });
  } else {
    buildNotes.innerHTML = '<p>No build notes available</p>';
  }
  
  // Show the affix details panel
  affixDetails.classList.remove('hidden');
}

// Function to load and display tempering data
async function loadTemperingData() {
  try {
    const response = await fetch('rulepack.json');
    const data = await response.json();
    const temperingJson = document.getElementById('tempering-json');
    if (temperingJson) {
      temperingJson.textContent = JSON.stringify(data.tempering || {}, null, 2);
    }
  } catch (error) {
    console.error('Error loading tempering data:', error);
  }
}

// Function to load and display masterworking data
async function loadMasterworkingData() {
  try {
    const response = await fetch('rulepack.json');
    const data = await response.json();
    const mwJson = document.getElementById('mw-json');
    if (mwJson) {
      mwJson.textContent = JSON.stringify(data.masterworking || {}, null, 2);
    }
  } catch (error) {
    console.error('Error loading masterworking data:', error);
  }
}

// Function to load and display skills data
async function loadSkillsData() {
  try {
    const response = await fetch('rulepack.json');
    const data = await response.json();
    const skillsList = document.getElementById('skills-list');
    if (skillsList && data.skills) {
      skillsList.innerHTML = '';
      data.skills.forEach(skill => {
        const li = document.createElement('li');
        li.textContent = skill;
        skillsList.appendChild(li);
      });
    }
  } catch (error) {
    console.error('Error loading skills data:', error);
  }
}

// Function to load and display paragon data
async function loadParagonData() {
  try {
    const response = await fetch('rulepack.json');
    const data = await response.json();
    const paragonList = document.getElementById('paragon-list');
    if (paragonList && data.paragon) {
      paragonList.innerHTML = '';
      data.paragon.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        paragonList.appendChild(li);
      });
    }
  } catch (error) {
    console.error('Error loading paragon data:', error);
  }
}

// Function to load and save notes
function loadNotes() {
  const notesText = document.getElementById('notes-text');
  if (notesText) {
    const savedNotes = localStorage.getItem('hydraSorcererNotes');
    if (savedNotes) {
      notesText.value = savedNotes;
    }
  }
}

function saveNotes() {
  const notesText = document.getElementById('notes-text');
  if (notesText) {
    localStorage.setItem('hydraSorcererNotes', notesText.value);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing...');
  
  // Load build data
  loadBuild();
  
  // Load notes
  loadNotes();
  
  // ----- Gear Details modal wiring (robust) -----
  (function initDetailsModal(){
    const modal  = document.getElementById('detailsModal');
    const closeB = document.getElementById('detailsClose');
    const bodyEl = document.body;

    if (!modal) return; // safe guard

    function openDetails() {
      modal.classList.remove('hidden');
      bodyEl.classList.add('no-scroll');
    }
    function closeDetails() {
      modal.classList.add('hidden');
      bodyEl.classList.remove('no-scroll');
    }

    // expose for other code
    window.__hcOpenDetails  = openDetails;
    window.__hcCloseDetails = closeDetails;

    // force closed on first load (even if HTML shipped visible)
    closeDetails();

    // close button
    closeB?.addEventListener('click', closeDetails);

    // click outside the card
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDetails();
    });

    // Esc key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetails();
    });
  })();
  
  // Set up tab functionality
  const tabButtons = document.querySelectorAll('#tabs button');
  const tabSections = document.querySelectorAll('.tab');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and sections
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabSections.forEach(section => section.classList.remove('active'));
      
      // Add active class to clicked button and target section
      button.classList.add('active');
      const targetSection = document.getElementById(targetTab);
      if (targetSection) {
        targetSection.classList.add('active');
        
        // Load tab-specific data
        if (targetTab === 'tempering') {
          loadTemperingData();
        } else if (targetTab === 'masterworking') {
          loadMasterworkingData();
        } else if (targetTab === 'skills') {
          loadSkillsData();
        } else if (targetTab === 'paragon') {
          loadParagonData();
        }
      }
    });
  });
  
  // Set up notes auto-save
  const notesText = document.getElementById('notes-text');
  if (notesText) {
    notesText.addEventListener('input', saveNotes);
  }
  
  // Set up affix gear selector
  const gearOptions = document.querySelectorAll('.gear-option');
  gearOptions.forEach(option => {
    option.addEventListener('click', () => {
      const slot = option.getAttribute('data-slot');
      showAffixDetails(slot);
    });
  });
  
  // Set up affix details close button
  const closeAffixDetails = document.getElementById('closeAffixDetails');
  if (closeAffixDetails) {
    closeAffixDetails.addEventListener('click', () => {
      const affixDetails = document.getElementById('affixDetails');
      affixDetails.classList.add('hidden');
    });
  }
  
  // Set up event listeners
  const checkGearBtn = document.getElementById('btn-check-gear');
  if (checkGearBtn) {
    checkGearBtn.addEventListener('click', openFilePickerForAnalysis);
  }
  
  const clearBuildBtn = document.getElementById('btn-clear-build');
  if (clearBuildBtn) {
    clearBuildBtn.addEventListener('click', clearBuild);
  }
  
  // Set up gear slot click handlers
  const slots = ['helm', 'amulet', 'chest', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
  slots.forEach(slot => {
    const slotElement = document.querySelector(`[data-slot="${slot}"]`);
    if (slotElement) {
      const addButton = slotElement.querySelector('.add-gear-btn');
      if (addButton) {
        addButton.addEventListener('click', () => openFilePicker());
      }
    }
  });
  
  // Legacy modal close handlers (for backward compatibility with other modals)
  const closeButtons = document.querySelectorAll('.close-btn');
  closeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const modal = button.closest('.modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    });
  });
  
  // Close legacy modals when clicking outside
  const legacyModals = document.querySelectorAll('.modal:not(#detailsModal)');
  legacyModals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
  
  // Initialize gear displays
  slots.forEach(slot => {
    const gearData = build[slot] || { name: 'No gear equipped' };
    updateGearDisplay(slot, gearData);
  });
  
  console.log('App initialized successfully');
});
