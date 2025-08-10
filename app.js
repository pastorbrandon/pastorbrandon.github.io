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
      const loadingDiv = document.getElementById('loading');
      loadingDiv.style.display = 'block';
      loadingDiv.textContent = 'Analyzing gear...';

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
    } finally {
      // Hide loading state
      document.getElementById('loading').style.display = 'none';
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
  const modal = document.getElementById('slotModal');
  const slots = ['helm', 'amulet', 'chest', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
  
  const container = document.getElementById('slotOptions');
  container.innerHTML = '';
  
  slots.forEach(slot => {
    const button = document.createElement('button');
    button.textContent = slot.charAt(0).toUpperCase() + slot.slice(1);
    button.onclick = () => {
      addGearManually(slot, imageData);
      modal.classList.add('hidden');
    };
    container.appendChild(button);
  });
  
  modal.classList.remove('hidden');
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
  const modal = document.getElementById('gearModal');
  if (modal) {
    modal.classList.add('hidden');
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
  const slotElement = document.getElementById(slot);
  if (!slotElement) return;

  const nameElement = slotElement.querySelector('.gear-name');
  const gradeElement = slotElement.querySelector('.gear-grade');
  const addButton = slotElement.querySelector('.add-gear-btn');

  if (gearData.name && gearData.name !== 'No gear equipped') {
    nameElement.textContent = gearData.name;
    gradeElement.textContent = `Grade: ${gearData.grade}`;
    gradeElement.className = `gear-grade grade-${gearData.grade.toLowerCase()}`;
    addButton.textContent = 'View Details';
    addButton.onclick = () => showGearModal(slot);
  } else {
    nameElement.textContent = 'No gear equipped';
    gradeElement.textContent = '';
    gradeElement.className = 'gear-grade';
    addButton.textContent = '+ Add Gear';
    addButton.onclick = () => openFilePicker();
  }
}

// Function to show gear modal
function showGearModal(slot) {
  const gearData = build[slot];
  if (!gearData) return;

  const modal = document.getElementById('gearModal');
  const modalContent = document.getElementById('modalContent');

  // Populate modal content
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>${gearData.name}</h2>
      <button class="close-btn" onclick="closeGearModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="gear-info">
        <p><strong>Slot:</strong> ${slot}</p>
        <p><strong>Grade:</strong> <span class="grade-${gearData.grade.toLowerCase()}">${gearData.grade}</span></p>
        <p><strong>Score:</strong> ${gearData.score || 'N/A'}/100</p>
      </div>
      
      <div class="gear-affixes">
        <h3>Affixes:</h3>
        <ul>
          ${gearData.affixes.map(affix => `<li>${affix}</li>`).join('')}
        </ul>
      </div>
      
      <div class="gear-aspect">
        <h3>Aspect:</h3>
        <p>${gearData.aspect}</p>
      </div>
      
      ${gearData.recommendations && gearData.recommendations.length > 0 ? `
        <div class="gear-recommendations">
          <h3>Recommendations:</h3>
          <ul>
            ${gearData.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${gearData.imageData ? `
        <div class="gear-image">
          <h3>Gear Image:</h3>
          <img src="${gearData.imageData}" alt="Gear" style="max-width: 100%; height: auto;">
        </div>
      ` : ''}
    </div>
  `;

  modal.classList.remove('hidden');
}

// Function to close gear modal
function closeGearModal() {
  const modal = document.getElementById('gearModal');
  modal.classList.add('hidden');
}

// Function to show analysis results
function showAnalysisResults(result) {
  const modal = document.getElementById('gearModal');
  const modalContent = document.getElementById('modalContent');

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2>Analysis Results</h2>
      <button class="close-btn" onclick="closeGearModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="analysis-info">
        <p><strong>Detected Slot:</strong> ${result.slot}</p>
        <p><strong>Item Name:</strong> ${result.name}</p>
      </div>
      
      <div class="analysis-affixes">
        <h3>Detected Affixes:</h3>
        <ul>
          ${result.affixes.map(affix => `<li>${affix}</li>`).join('')}
        </ul>
      </div>
      
      <div class="analysis-aspect">
        <h3>Detected Aspect:</h3>
        <p>${result.aspect}</p>
      </div>
      
      <div class="analysis-actions">
        <button onclick="applyReportToSlot('${result.slot}', currentAnalysis.gearData)" class="apply-btn">
          Apply to ${result.slot}
        </button>
        <button onclick="showSlotSelectionModal(currentAnalysis.imageData)" class="manual-btn">
          Choose Different Slot
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
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
    
    console.log('Build cleared');
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing...');
  
  // Load build data
  loadBuild();
  
  // Set up event listeners
  document.getElementById('checkGearBtn').addEventListener('click', openFilePickerForAnalysis);
  document.getElementById('clearBuildBtn').addEventListener('click', clearBuild);
  
  // Set up gear slot click handlers
  const slots = ['helm', 'amulet', 'chest', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
  slots.forEach(slot => {
    const slotElement = document.getElementById(slot);
    if (slotElement) {
      const addButton = slotElement.querySelector('.add-gear-btn');
      addButton.addEventListener('click', () => openFilePicker());
    }
  });
  
  // Set up modal close handlers
  const closeButtons = document.querySelectorAll('.close-btn');
  closeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const modal = button.closest('.modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    });
  });
  
  // Close modal when clicking outside
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
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
