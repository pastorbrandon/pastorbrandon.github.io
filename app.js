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
    affixes: report.affixes, // Keep full affix objects with stat and val
    score: report.score || 0,
    grade: report.status.toLowerCase(),
    slot: report.slot,
    reasons: report.reasons,
    improvements: report.improvements,
    aspects: report.aspects || [] // Store aspects from AI report
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
      if (gearData.affixes.some(g => {
        const affixText = typeof g === 'object' ? g.stat : g;
        return affixText.toLowerCase().includes(affix.toLowerCase());
      })) {
        score += 40;
      }
    });
    
    // Check preferred affixes (15 points each)
    preferredAffixes.forEach(affix => {
      if (gearData.affixes.some(g => {
        const affixText = typeof g === 'object' ? g.stat : g;
        return affixText.toLowerCase().includes(affix.toLowerCase());
      })) {
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
    
    // Check for missing mandatory affixes
    const missingMandatory = slotRules.mandatoryAffixes.filter(affix => 
      !gearData.affixes.some(g => {
        const affixText = typeof g === 'object' ? g.stat : g;
        return affixText.toLowerCase().includes(affix.toLowerCase());
      })
    );
    
    // Check for missing preferred affixes
    const missingPreferred = slotRules.preferredAffixes.filter(affix => 
      !gearData.affixes.some(g => {
        const affixText = typeof g === 'object' ? g.stat : g;
        return affixText.toLowerCase().includes(affix.toLowerCase());
      })
    );
    
    // Check for incorrect aspects
    const correctAspects = slotRules.aspects || [];
    const currentAspects = gearData.aspects || [];
    const incorrectAspects = currentAspects.filter(aspect => 
      !correctAspects.some(correct => 
        aspect.toLowerCase().includes(correct.toLowerCase())
      )
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
    
    if (incorrectAspects.length > 0) {
      improvementHtml += '<li><strong>Incorrect Aspects:</strong></li>';
      incorrectAspects.forEach(aspect => {
        improvementHtml += `<li>• Replace "${aspect}" with correct aspect</li>`;
      });
    }
    
    if (correctAspects.length > 0 && currentAspects.length === 0) {
      improvementHtml += '<li><strong>Missing Aspects:</strong></li>';
      correctAspects.forEach(aspect => {
        improvementHtml += `<li>• Add "${aspect}"</li>`;
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
      // Build detailed specs for current gear
      let currentSpecs = '';
      if (currentGear.affixes && currentGear.affixes.length > 0) {
        currentSpecs += '<div class="gear-affixes"><strong>Affixes:</strong><ul>';
        currentGear.affixes.forEach(affix => {
          if (typeof affix === 'object' && affix.stat && affix.val) {
            currentSpecs += `<li>${affix.stat}: ${affix.val}</li>`;
          } else if (typeof affix === 'string') {
            currentSpecs += `<li>${affix}</li>`;
          }
        });
        currentSpecs += '</ul></div>';
      }
      
      if (currentGear.aspects && currentGear.aspects.length > 0) {
        currentSpecs += '<div class="gear-aspects"><strong>Aspects:</strong><ul>';
        currentGear.aspects.forEach(aspect => {
          currentSpecs += `<li>${aspect}</li>`;
        });
        currentSpecs += '</ul></div>';
      }
      
      currentGearInfo.innerHTML = `
        <p class="gear-name">${currentGear.name}</p>
        <p class="gear-status">Status: ${currentGear.grade} (${currentGear.score}/100)</p>
        <div class="gear-specs">${currentSpecs}</div>
      `;
    } else {
      currentGearInfo.innerHTML = `
        <p class="gear-name">No gear equipped</p>
        <p class="gear-status">Status: —</p>
        <div class="gear-specs"></div>
      `;
    }
  }
  
  // Update new gear info
  const newGearInfo = document.getElementById('newGearInfo');
  if (newGearInfo) {
    // Build detailed specs for new gear
    let newSpecs = '';
    if (newGearData.affixes && newGearData.affixes.length > 0) {
      newSpecs += '<div class="gear-affixes"><strong>Affixes:</strong><ul>';
      newGearData.affixes.forEach(affix => {
        if (typeof affix === 'object' && affix.stat && affix.val) {
          newSpecs += `<li>${affix.stat}: ${affix.val}</li>`;
        } else if (typeof affix === 'string') {
          newSpecs += `<li>${affix}</li>`;
        }
      });
      newSpecs += '</ul></div>';
    }
    
    if (newGearData.aspects && newGearData.aspects.length > 0) {
      newSpecs += '<div class="gear-aspects"><strong>Aspects:</strong><ul>';
      newGearData.aspects.forEach(aspect => {
        newSpecs += `<li>${aspect}</li>`;
      });
      newSpecs += '</ul></div>';
    }
    
    newGearInfo.innerHTML = `
      <p class="gear-name">${newGearData.name}</p>
      <p class="gear-status">Status: ${newGearData.grade} (${newGearData.score}/100)</p>
      <div class="gear-specs">${newSpecs}</div>
    `;
  }
  
  // Generate recommendation with detailed reasoning
  const recommendation = generateRecommendation(detectedSlot, newGearData);
  const recommendationReasons = document.getElementById('recommendationReasons');
  if (recommendationReasons) {
    recommendationReasons.innerHTML = `
      <p id="recommendationText">${recommendation.text}</p>
      <div class="recommendation-details">
        <ul>
          ${recommendation.reasons.map(reason => `<li>• ${reason}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // Both buttons are always enabled - user can override recommendation
  const btnSwitch = document.getElementById('btn-switch');
  const btnDiscard = document.getElementById('btn-discard');
  
  if (btnSwitch) {
    btnSwitch.disabled = false;
    btnSwitch.textContent = '✅ Switch';
    btnSwitch.className = 'btn-primary';
  }
  
  if (btnDiscard) {
    btnDiscard.disabled = false;
    btnDiscard.textContent = '🗑️ Discard';
    btnDiscard.className = 'btn-secondary';
  }
}

// Generate recommendation logic - DECISIVE VERSION WITH REASONING
function generateRecommendation(slot, newGearData) {
  const currentGear = build[slot];
  const currentScore = currentGear ? (currentGear.score || 0) : 0;
  const newScore = newGearData.score;
  
  let reasons = [];
  
  // Clear, decisive recommendations with detailed reasoning
  if (newScore >= 90) {
    reasons.push(`🔥 BiS (Best in Slot) material with score ${newScore}/100`);
    reasons.push(`Significantly better than current gear (${currentScore}/100)`);
    reasons.push(`Excellent for endgame content and high-tier pushing`);
    
    return {
      text: `🔥 SWITCH - This is BiS (Best in Slot) material! Score: ${newScore}/100`,
      action: 'switch',
      canSwitch: true,
      reasons: reasons
    };
  } else if (newScore >= 80) {
    if (newScore > currentScore + 5) {
      reasons.push(`Excellent upgrade: ${newScore}/100 vs current ${currentScore}/100`);
      reasons.push(`+${newScore - currentScore} score improvement`);
      reasons.push(`Great for speed farming and general content`);
      
      return {
        text: `✅ SWITCH - Excellent upgrade! New: ${newScore}/100 vs Current: ${currentScore}/100`,
        action: 'switch',
        canSwitch: true,
        reasons: reasons
      };
    } else {
      reasons.push(`Great gear but current is better (${currentScore}/100 vs ${newScore}/100)`);
      reasons.push(`Only ${currentScore - newScore} points difference`);
      reasons.push(`Consider keeping for backup or alternative builds`);
      
      return {
        text: `💾 STASH - Great gear but current is better. Keep for later!`,
        action: 'stash',
        canSwitch: false,
        reasons: reasons
      };
    }
  } else if (newScore >= 70) {
    if (newScore > currentScore + 10) {
      reasons.push(`Good upgrade: ${newScore}/100 vs current ${currentScore}/100`);
      reasons.push(`+${newScore - currentScore} score improvement`);
      reasons.push(`Decent for mid-tier content`);
      
      return {
        text: `✅ SWITCH - Good upgrade! New: ${newScore}/100 vs Current: ${currentScore}/100`,
        action: 'switch',
        canSwitch: true,
        reasons: reasons
      };
    } else {
      reasons.push(`Decent gear but current is better (${currentScore}/100 vs ${newScore}/100)`);
      reasons.push(`${currentScore - newScore} points worse than current`);
      reasons.push(`Consider for backup or salvage for materials`);
      
      return {
        text: `💾 STASH - Decent gear, stash for backup or alts`,
        action: 'stash',
        canSwitch: false,
        reasons: reasons
      };
    }
  } else if (newScore >= 50) {
    if (newScore > currentScore + 15) {
      reasons.push(`Mediocre but better than current: ${newScore}/100 vs ${currentScore}/100`);
      reasons.push(`+${newScore - currentScore} score improvement`);
      reasons.push(`Only switch if you need immediate upgrade`);
      
      return {
        text: `✅ SWITCH - Mediocre but better than current. New: ${newScore}/100 vs Current: ${currentScore}/100`,
        action: 'switch',
        canSwitch: true,
        reasons: reasons
      };
    } else {
      reasons.push(`Mediocre gear: ${newScore}/100 score`);
      reasons.push(`${currentScore - newScore} points worse than current`);
      reasons.push(`Not worth keeping - salvage for materials`);
      
      return {
        text: `🗑️ SALVAGE - Mediocre gear, not worth keeping`,
        action: 'salvage',
        canSwitch: false,
        reasons: reasons
      };
    }
  } else {
    reasons.push(`Poor gear: ${newScore}/100 score`);
    reasons.push(`${currentScore - newScore} points worse than current`);
    reasons.push(`Definitely salvage for materials`);
    
    return {
      text: `🗑️ SALVAGE - Poor gear, salvage for materials`,
      action: 'salvage',
      canSwitch: false,
      reasons: reasons
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
  const btnClose = document.getElementById('btn-close');
  const btnDiscard = document.getElementById('btn-discard'); // Added btnDiscard

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

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
      if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
    });
  }

  if (btnDiscard) { // Added btnDiscard
    btnDiscard.addEventListener('click', () => {
      const gearAnalysisPanel = document.getElementById('gearAnalysisPanel');
      if (gearAnalysisPanel) gearAnalysisPanel.classList.add('hidden');
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
