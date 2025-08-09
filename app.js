// Test if JavaScript is running
console.log('=== JAVASCRIPT LOADED ===');

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
  return r.json();
}

// Local storage keys
const STORAGE_KEY = 'hc-build-v1';
const SLOTS = ['helm','amulet','chest','gloves','pants','boots','ring1','ring2','weapon','offhand'];

function loadBuild() { 
  try { 
    const build = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return build;
  } catch (error) {
    console.error('Error loading build:', error);
    return {}; 
  } 
}

function saveBuild(build) { 
  localStorage.setItem(STORAGE_KEY, JSON.stringify(build)); 
}

let build = loadBuild();

// Gear analysis state
let currentAnalysis = {
  newGearData: null,
  detectedSlot: null,
  targetSlot: null,
  directEquip: false
};

// Force hide modal immediately
const gearModal = document.getElementById('gearModal');
if (gearModal) {
  gearModal.classList.add('hidden');
  gearModal.style.display = 'none';
}

// Function to open file picker for analysis
function openFilePickerForAnalysis() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        console.log('File selected for analysis');
        
        // Show analysis panel
        const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
        if (gearAnalysisPanel) gearAnalysisPanel.classList.remove('hidden');
        
        // Update new gear info
        const newGearInfo = document.getElementById('newGearInfo');
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
        
        // Analyze with GPT (AI will identify gear type)
        const report = await analyzeWithGPT(dataUrl, 'auto', rules);
        console.log('Analysis report:', report);
        
        // Handle ring slots specially
        let targetSlot = report.slot;
        if (targetSlot === 'ring') {
          const ring1Gear = build['ring1'];
          const ring2Gear = build['ring2'];
          const ring1Score = ring1Gear ? (ring1Gear.score || 0) : 0;
          const ring2Score = ring2Gear ? (ring2Gear.score || 0) : 0;
          
          if (ring1Score <= ring2Score) {
            targetSlot = 'ring1';
          } else {
            targetSlot = 'ring2';
          }
        }
        
        // Convert report to our format
        const gearData = {
          name: report.name,
          affixes: report.affixes.map(affix => affix.stat),
          score: report.score || 0,
          grade: report.status.toLowerCase(),
          slot: targetSlot,
          reasons: report.reasons,
          improvements: report.improvements
        };
        
        // Update analysis state
        currentAnalysis.newGearData = gearData;
        currentAnalysis.detectedSlot = targetSlot;
        
        // Update the analysis panel
        updateGearAnalysis(targetSlot, gearData);
        
      } catch (error) {
        console.error('Analysis failed:', error);
        alert('Analysis failed: ' + (error.message || error));
        
        // Hide analysis panel
        const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
        if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
      }
    }
  });
  
  fileInput.click();
}

// Function to open file picker for direct equip
function openFilePicker() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  
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
  
  fileInput.click();
}

// Function to manually add gear
function addGearManually(slot) {
  console.log(`Adding gear for slot: ${slot}`);
  
  // Store the target slot for when we capture the image
  currentAnalysis.targetSlot = slot;
  currentAnalysis.directEquip = true;
  
  // Open file picker
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

// Gear scoring system
function scoreGear(slot, gearData) {
  if (!gearData || !gearData.affixes) return 0;
  
  try {
    const rules = JSON.parse(localStorage.getItem('rulepack-cache') || '{}');
    const slotRules = rules.slots && rules.slots[slot.charAt(0).toUpperCase() + slot.slice(1)];
    
    if (!slotRules) return Math.floor(Math.random() * 100);
    
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
  const gearData = build[slot];
  if (!gearData) return;
  
  const modalTitle = document.getElementById('modalTitle');
  const modalGearName = document.getElementById('modalGearName');
  const modalGearStats = document.getElementById('modalGearStats');
  const modalGearGrade = document.getElementById('modalGearGrade');
  const modalImprovement = document.getElementById('modalImprovement');
  
  if (modalTitle) modalTitle.textContent = `${slot.charAt(0).toUpperCase() + slot.slice(1)} Details`;
  if (modalGearName) modalGearName.textContent = gearData.name;
  
  // Build stats HTML with affix values
  let statsHtml = '';
  if (gearData.affixes && gearData.affixes.length > 0) {
    statsHtml += '<h4>Affixes:</h4><ul>';
    gearData.affixes.forEach(affix => {
      if (typeof affix === 'object' && affix.stat && affix.val) {
        statsHtml += `<li>${affix.stat}: ${affix.val}</li>`;
      } else if (typeof affix === 'string') {
        statsHtml += `<li>${affix}</li>`;
      }
    });
    statsHtml += '</ul>';
  }
  
  // Add aspects if present
  if (gearData.aspects && gearData.aspects.length > 0) {
    statsHtml += '<h4>Aspects:</h4><ul>';
    gearData.aspects.forEach(aspect => {
      statsHtml += `<li>${aspect}</li>`;
    });
    statsHtml += '</ul>';
  }
  
  if (modalGearStats) modalGearStats.innerHTML = statsHtml;
  
  // Show grade
  if (modalGearGrade) {
    const gradeColors = {
      'blue': '#4a9eff',
      'green': '#4caf50',
      'yellow': '#ffc107',
      'red': '#f44336'
    };
    modalGearGrade.innerHTML = `
      <span style="color: ${gradeColors[gearData.grade] || '#999'}">
        Grade: ${gearData.grade.toUpperCase()} (${gearData.score}/100)
      </span>
    `;
  }
  
  // Show improvement suggestions for non-blue gear
  if (modalImprovement && gearData.grade !== 'blue') {
    showImprovementSuggestions(slot, gearData);
  } else if (modalImprovement) {
    modalImprovement.classList.add('hidden');
  }
  
  // Show modal
  const gearModal = document.getElementById('gearModal');
  if (gearModal) {
    gearModal.classList.remove('hidden');
    gearModal.style.display = 'block';
  }
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

// Update gear analysis UI
function updateGearAnalysis(detectedSlot, newGearData) {
  // Update current gear info
  const currentGear = build[detectedSlot];
  const currentGearInfo = document.getElementById('currentGearInfo');
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
  const newGearInfo = document.getElementById('newGearInfo');
  if (newGearInfo) {
    newGearInfo.innerHTML = `
      <p class="gear-name">${newGearData.name}</p>
      <p class="gear-status">Status: ${newGearData.grade} (${newGearData.score}/100)</p>
    `;
  }
  
  // Generate recommendation
  const recommendation = generateRecommendation(detectedSlot, newGearData);
  const recommendationText = document.getElementById('recommendationText');
  if (recommendationText) {
    recommendationText.textContent = recommendation.text;
  }
  
  // Enable/disable buttons based on recommendation
  const btnSwitch = document.getElementById('btn-switch');
  const btnSalvage = document.getElementById('btn-salvage');
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

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing...');
  
  // Ensure modal is hidden on page load
  const gearModal = document.getElementById('gearModal');
  if (gearModal) {
    gearModal.classList.add('hidden');
    gearModal.style.display = 'none';
  }
  
  // Close modal function
  function closeGearModal() {
    if (gearModal) {
      gearModal.classList.add('hidden');
      gearModal.style.display = 'none';
    }
  }
  
  // Set up modal close handlers
  const closeModal = document.getElementById('closeModal');
  if (closeModal) {
    closeModal.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeGearModal();
    });
  }
  
  // Set up gear slot click handlers
  SLOTS.forEach(slot => {
    const slotElement = document.querySelector(`[data-slot="${slot}"]`);
    if (slotElement) {
      const gearName = slotElement.querySelector('.gear-name');
      if (gearName) {
        gearName.addEventListener('click', () => {
          if (build[slot]) {
            showGearModal(slot);
          }
        });
      }
    }
  });
  
  // Set up Add Gear buttons
  const addGearButtons = document.querySelectorAll('.add-gear-btn');
  addGearButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const slotElement = btn.closest('[data-slot]');
      if (slotElement) {
        const slot = slotElement.dataset.slot;
        addGearManually(slot);
      }
    });
  });
  
  // Hook up Check New Gear button
  const btnCheckGear = document.getElementById('btn-check-gear');
  if (btnCheckGear) {
    btnCheckGear.addEventListener('click', () => {
      console.log('Check Gear button clicked!');
      openFilePickerForAnalysis();
    });
  }
  
  // Hook up gear action buttons
  const btnSwitch = document.getElementById('btn-switch');
  const btnSalvage = document.getElementById('btn-salvage');
  
  if (btnSwitch) {
    btnSwitch.addEventListener('click', () => {
      if (!currentAnalysis.detectedSlot || !currentAnalysis.newGearData) return;
      
      const slot = currentAnalysis.detectedSlot;
      const gearData = currentAnalysis.newGearData;
      
      // Update build with new gear
      build[slot] = gearData;
      updateGearDisplay(slot, gearData);
      saveBuild(build);
      
      // Close analysis panel
      const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
      if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
      
      // Show success message
      alert(`✅ ${slot} switched successfully!`);
    });
  }
  
  if (btnSalvage) {
    btnSalvage.addEventListener('click', () => {
      if (confirm('🗑️ Are you sure you want to salvage this gear?')) {
        alert('🗑️ Gear salvaged for materials.');
        const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
        if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
      }
    });
  }
  
  // Load demo data
  const btnLoadDemo = document.getElementById('btn-load-demo');
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
  
  const btnClearBuild = document.getElementById('btn-clear-build');
  if (btnClearBuild) {
    btnClearBuild.addEventListener('click', () => {
      if (!confirm('Clear saved build data & notes?')) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }
  
  // Notes functionality
  const NOTES_KEY = 'hc-notes';
  const notes = document.getElementById('notes-text');
  if (notes) {
    notes.value = localStorage.getItem(NOTES_KEY) || '';
    notes.addEventListener('input', () => localStorage.setItem(NOTES_KEY, notes.value));
  }
  
  console.log('App initialized successfully');
});
