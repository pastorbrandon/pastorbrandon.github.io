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
  
  const result = await r.json();
  
  // Validate the analysis result
  if (!validateAnalysisResult(result)) {
    throw new Error('Analysis result is incomplete or invalid. Please try again with a clearer image.');
  }
  
  return result;
}

// Validate analysis result completeness
function validateAnalysisResult(result) {
  if (!result || typeof result !== 'object') return false;
  
  // Check required fields for new schema
  if (!result.name || !result.slot || !result.status) return false;
  
  // Check that affixes array exists and has content
  if (!Array.isArray(result.affixes)) return false;
  
  // Check that aspect object exists (new schema uses single aspect object)
  if (!result.aspect || typeof result.aspect !== 'object') return false;
  
  // Validate affix objects (new schema structure) - be more flexible
  for (const affix of result.affixes) {
    if (typeof affix !== 'object' || !affix.stat) {
      return false;
    }
    // Allow val to be undefined/null for flexibility
    if (affix.val !== undefined && typeof affix.val !== 'number' && affix.val !== null) {
      return false;
    }
  }
  
  // Validate aspect object (new schema structure) - be more flexible
  if (!result.aspect.text) {
    return false;
  }
  // Allow name and source to be null/undefined for flexibility
  
  return true;
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
console.log('Loaded build data:', build);

// Check if there's any problematic data that might cause modal to show
if (Object.keys(build).length > 0) {
  console.log('Found saved build data. Checking for problematic entries...');
  Object.keys(build).forEach(slot => {
    const gearData = build[slot];
    if (gearData && gearData.name && gearData.name !== 'No gear equipped') {
      console.log(`Slot ${slot} has gear:`, gearData.name);
    }
  });
}

// Gear analysis state
let currentAnalysis = {
  newGearData: null,
  detectedSlot: null,
  targetSlot: null,
  directEquip: false
};

// Modal control flag
let modalShouldShow = false;

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
        console.log('Full AI Analysis report:', JSON.stringify(report, null, 2));
        
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
        
        // Convert report to our format - preserve all details
        const gearData = {
          name: report.name,
          affixes: report.affixes || [], // Keep full affix objects with stat, val, and type
          score: report.score || 0,
          grade: report.status.toLowerCase(),
          slot: targetSlot,
          reasons: report.reasons || [],
          improvements: report.improvements || [],
          aspects: report.aspects || [], // Preserve aspects
          rarity: report.rarity,
          type: report.type,
          itemLevel: report.itemLevel,
          notes: report.notes
        };
        
        console.log('Converted gear data:', JSON.stringify(gearData, null, 2));
        
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
  
  // Handle new aspect format (single object) vs old format (array of objects/strings)
  let processedAspects = [];
  if (report.aspect && typeof report.aspect === 'object') {
    // New schema: single aspect object
    processedAspects = [`${report.aspect.name || 'Unknown'}: ${report.aspect.text}`];
  } else if (report.aspects && Array.isArray(report.aspects)) {
    // Old format: array of aspects
    processedAspects = report.aspects.map(aspect => {
      if (typeof aspect === 'object' && aspect.name && aspect.description) {
        return `${aspect.name}: ${aspect.description}`;
      } else if (typeof aspect === 'string') {
        return aspect;
      }
      return String(aspect);
    });
  }
  
  // Convert the report format to our app's format
  const gearData = {
    name: report.name,
    affixes: report.affixes || [], // Keep full affix objects with stat and val
    score: report.score || 0,
    grade: report.status.toLowerCase(),
    slot: report.slot,
    reasons: report.reasons || [],
    improvements: report.improvements || [],
    aspects: processedAspects,
    rarity: report.rarity,
    type: report.type,
    itemLevel: report.item_power || report.itemLevel, // Handle both new and old field names
    notes: report.notes,
    // New fields from enhanced schema
    armor: report.armor,
    masterwork: report.masterwork,
    tempers: report.tempers,
    sockets: report.sockets,
    gems: report.gems || [],
    confidence: report.confidence
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
    const preferredAspects = slotRules.aspects || [];
    
    // Check mandatory affixes (35 points each)
    mandatoryAffixes.forEach(affix => {
      if (gearData.affixes.some(g => {
        const affixText = typeof g === 'object' ? g.stat : g;
        return affixText.toLowerCase().includes(affix.toLowerCase());
      })) {
        score += 35;
      }
    });
    
    // Check preferred affixes (12 points each)
    preferredAffixes.forEach(affix => {
      if (gearData.affixes.some(g => {
        const affixText = typeof g === 'object' ? g.stat : g;
        return affixText.toLowerCase().includes(affix.toLowerCase());
      })) {
        score += 12;
      }
    });
    
    // Check aspects (15 points each for preferred aspects)
    if (gearData.aspects && gearData.aspects.length > 0) {
      preferredAspects.forEach(preferredAspect => {
        if (gearData.aspects.some(aspect => {
          const aspectText = typeof aspect === 'string' ? aspect : aspect.name || '';
          return aspectText.toLowerCase().includes(preferredAspect.toLowerCase());
        })) {
          score += 15;
        }
      });
      
      // Bonus for having any aspects (5 points each, up to 10)
      score += Math.min(gearData.aspects.length * 5, 10);
    }
    
    // Bonus for having more affixes (up to 15 points)
    score += Math.min(gearData.affixes.length * 3, 15);
    
    // Bonus for high item level (if available)
    if (gearData.itemLevel && typeof gearData.itemLevel === 'number') {
      if (gearData.itemLevel >= 925) score += 5;
      else if (gearData.itemLevel >= 900) score += 3;
      else if (gearData.itemLevel >= 850) score += 1;
    }
    
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
  console.log('=== showGearModal called ===');
  console.log('Slot:', slot);
  console.log('Call stack:', new Error().stack);
  
  const gearData = build[slot];
  if (!gearData) {
    console.log('No gear data found for slot:', slot);
    return;
  }
  
  console.log('Gear data:', gearData);
  
  const modalTitle = document.getElementById('modalTitle');
  const modalGearName = document.getElementById('modalGearName');
  const modalGearStats = document.getElementById('modalGearStats');
  const modalGearGrade = document.getElementById('modalGearGrade');
  const modalImprovement = document.getElementById('modalImprovement');
  
  if (modalTitle) modalTitle.textContent = `${slot.charAt(0).toUpperCase() + slot.slice(1)} Details`;
  if (modalGearName) modalGearName.textContent = gearData.name || 'Unknown Item';
  
  // Build stats HTML with affix values
  let statsHtml = '';
  
  // Add item details
  if (gearData.rarity || gearData.type || gearData.itemLevel) {
    statsHtml += '<h4>Item Details:</h4><ul>';
    if (gearData.rarity) statsHtml += `<li>Rarity: ${gearData.rarity}</li>`;
    if (gearData.type) statsHtml += `<li>Type: ${gearData.type}</li>`;
    if (gearData.itemLevel) statsHtml += `<li>Item Level: ${gearData.itemLevel}</li>`;
    statsHtml += '</ul>';
  }
  
  if (gearData.affixes && gearData.affixes.length > 0) {
    statsHtml += '<h4>Affixes:</h4><ul>';
    gearData.affixes.forEach(affix => {
      if (typeof affix === 'object' && affix.stat && affix.val) {
        const affixType = affix.type ? ` (${affix.type})` : '';
        statsHtml += `<li>${affix.stat}: ${affix.val}${affixType}</li>`;
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
  
  // Add notes if present
  if (gearData.notes) {
    statsHtml += '<h4>Notes:</h4><p>' + gearData.notes + '</p>';
  }
  
  if (modalGearStats) modalGearStats.innerHTML = statsHtml;
  
  // Show grade
  if (modalGearGrade && gearData.grade) {
    const gradeColors = {
      'blue': '#4a9eff',
      'green': '#4caf50',
      'yellow': '#ffc107',
      'red': '#f44336'
    };
    modalGearGrade.innerHTML = `
      <span style="color: ${gradeColors[gearData.grade] || '#999'}">
        Grade: ${gearData.grade.toUpperCase()} (${gearData.score || 0}/100)
      </span>
    `;
  }
  
  // Show improvement suggestions for non-blue gear
  if (modalImprovement && gearData.grade && gearData.grade !== 'blue') {
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
  console.log('updateGearAnalysis called with:', { detectedSlot, newGearData });
  
  // Update current gear info
  const currentGear = build[detectedSlot];
  const currentGearInfo = document.getElementById('currentGearInfo');
  if (currentGearInfo) {
    if (currentGear) {
      // Build detailed specs for current gear
      let currentSpecs = '';
      
      // Add item details
      if (currentGear.rarity || currentGear.type || currentGear.itemLevel) {
        currentSpecs += '<div class="gear-details"><strong>Details:</strong><ul>';
        if (currentGear.rarity) currentSpecs += `<li>Rarity: ${currentGear.rarity}</li>`;
        if (currentGear.type) currentSpecs += `<li>Type: ${currentGear.type}</li>`;
        if (currentGear.itemLevel) currentSpecs += `<li>Item Level: ${currentGear.itemLevel}</li>`;
        currentSpecs += '</ul></div>';
      }
      
      if (currentGear.affixes && currentGear.affixes.length > 0) {
        currentSpecs += '<div class="gear-affixes"><strong>Affixes:</strong><ul>';
        currentGear.affixes.forEach(affix => {
          if (typeof affix === 'object' && affix.stat && affix.val !== undefined) {
            const unit = affix.unit ? ` ${affix.unit}` : '';
            const greater = affix.greater ? ' <span class="greater-affix">(Greater)</span>' : '';
            const tempered = affix.tempered ? ' <span class="tempered-affix">(Tempered)</span>' : '';
            currentSpecs += `<li>${affix.stat}: ${affix.val}${unit}${greater}${tempered}</li>`;
          } else if (typeof affix === 'string') {
            currentSpecs += `<li>${affix}</li>`;
          }
        });
        currentSpecs += '</ul></div>';
      }
      
      // Handle new aspect structure (single object) vs old structure (array)
      if (currentGear.aspect && typeof currentGear.aspect === 'object') {
        currentSpecs += '<div class="gear-aspects"><strong>Aspects:</strong><ul>';
        const sourceText = currentGear.aspect.source === 'imprinted' ? ' (Imprinted)' : 
                          currentGear.aspect.source === 'unique_base' ? ' (Unique Base)' : '';
        currentSpecs += `<li>${currentGear.aspect.name || 'Unknown'}${sourceText}: ${currentGear.aspect.text}</li>`;
        currentSpecs += '</ul></div>';
      } else if (currentGear.aspects && currentGear.aspects.length > 0) {
        currentSpecs += '<div class="gear-aspects"><strong>Aspects:</strong><ul>';
        currentGear.aspects.forEach(aspect => {
          currentSpecs += `<li>${aspect}</li>`;
        });
        currentSpecs += '</ul></div>';
      }
      
      // Add new fields from enhanced schema
      if (currentGear.masterwork && (currentGear.masterwork.rank || currentGear.masterwork.max)) {
        currentSpecs += '<div class="gear-masterwork"><strong>Masterwork:</strong><ul>';
        currentSpecs += `<li>Rank: ${currentGear.masterwork.rank || 0}/${currentGear.masterwork.max || 0}</li>`;
        currentSpecs += '</ul></div>';
      }
      
      if (currentGear.tempers && (currentGear.tempers.used || currentGear.tempers.max)) {
        currentSpecs += '<div class="gear-tempers"><strong>Tempering:</strong><ul>';
        currentSpecs += `<li>Used: ${currentGear.tempers.used || 0}/${currentGear.tempers.max || 0}</li>`;
        currentSpecs += '</ul></div>';
      }
      
      if (currentGear.sockets) {
        currentSpecs += '<div class="gear-sockets"><strong>Sockets:</strong><ul>';
        currentSpecs += `<li>Count: ${currentGear.sockets}</li>`;
        if (currentGear.gems && currentGear.gems.length > 0) {
          currentGear.gems.forEach(gem => {
            currentSpecs += `<li>Gem: ${gem}</li>`;
          });
        }
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
    // Build detailed specs for new gear - same format as current gear
    let newSpecs = '';
    
    // Add item details
    if (newGearData.rarity || newGearData.type || newGearData.itemLevel) {
      newSpecs += '<div class="gear-details"><strong>Details:</strong><ul>';
      if (newGearData.rarity) newSpecs += `<li>Rarity: ${newGearData.rarity}</li>`;
      if (newGearData.type) newSpecs += `<li>Type: ${newGearData.type}</li>`;
      if (newGearData.itemLevel) newSpecs += `<li>Item Level: ${newGearData.itemLevel}</li>`;
      newSpecs += '</ul></div>';
    }
    
    if (newGearData.affixes && newGearData.affixes.length > 0) {
      newSpecs += '<div class="gear-affixes"><strong>Affixes:</strong><ul>';
      newGearData.affixes.forEach(affix => {
        if (typeof affix === 'object' && affix.stat && affix.val !== undefined) {
          const unit = affix.unit ? ` ${affix.unit}` : '';
          const greater = affix.greater ? ' <span class="greater-affix">(Greater)</span>' : '';
          const tempered = affix.tempered ? ' <span class="tempered-affix">(Tempered)</span>' : '';
          newSpecs += `<li>${affix.stat}: ${affix.val}${unit}${greater}${tempered}</li>`;
        } else if (typeof affix === 'string') {
          newSpecs += `<li>${affix}</li>`;
        }
      });
      newSpecs += '</ul></div>';
    }
    
    // Handle new aspect structure (single object) vs old structure (array)
    if (newGearData.aspect && typeof newGearData.aspect === 'object') {
      newSpecs += '<div class="gear-aspects"><strong>Aspects:</strong><ul>';
      const sourceText = newGearData.aspect.source === 'imprinted' ? ' (Imprinted)' : 
                        newGearData.aspect.source === 'unique_base' ? ' (Unique Base)' : '';
      newSpecs += `<li>${newGearData.aspect.name || 'Unknown'}${sourceText}: ${newGearData.aspect.text}</li>`;
      newSpecs += '</ul></div>';
    } else if (newGearData.aspects && newGearData.aspects.length > 0) {
      newSpecs += '<div class="gear-aspects"><strong>Aspects:</strong><ul>';
      newGearData.aspects.forEach(aspect => {
        newSpecs += `<li>${aspect}</li>`;
      });
      newSpecs += '</ul></div>';
    }
    
    // Add new fields from enhanced schema
    if (newGearData.masterwork && (newGearData.masterwork.rank || newGearData.masterwork.max)) {
      newSpecs += '<div class="gear-masterwork"><strong>Masterwork:</strong><ul>';
      newSpecs += `<li>Rank: ${newGearData.masterwork.rank || 0}/${newGearData.masterwork.max || 0}</li>`;
      newSpecs += '</ul></div>';
    }
    
    if (newGearData.tempers && (newGearData.tempers.used || newGearData.tempers.max)) {
      newSpecs += '<div class="gear-tempers"><strong>Tempering:</strong><ul>';
      newSpecs += `<li>Used: ${newGearData.tempers.used || 0}/${newGearData.tempers.max || 0}</li>`;
      newSpecs += '</ul></div>';
    }
    
    if (newGearData.sockets) {
      newSpecs += '<div class="gear-sockets"><strong>Sockets:</strong><ul>';
      newSpecs += `<li>Count: ${newGearData.sockets}</li>`;
      if (newGearData.gems && newGearData.gems.length > 0) {
        newGearData.gems.forEach(gem => {
          newSpecs += `<li>Gem: ${gem}</li>`;
        });
      }
      newSpecs += '</ul></div>';
    }
    
    // Add notes if present
    if (newGearData.notes) {
      newSpecs += '<div class="gear-notes"><strong>Notes:</strong><p>' + newGearData.notes + '</p></div>';
    }
    
    // Use the same detailed format as current gear display
    const newGearHtml = `
      <div class="gear-info">
        <p class="gear-name">${newGearData.name}</p>
        <p class="gear-status">Status: ${newGearData.grade} (${newGearData.score}/100)</p>
        <div class="gear-specs">${newSpecs}</div>
      </div>
    `;
    
    console.log('Setting newGearInfo HTML:', newGearHtml);
    newGearInfo.innerHTML = newGearHtml;
  }
  
  // Generate recommendation with detailed reasoning
  const recommendation = generateRecommendation(detectedSlot, newGearData);
  const plainLanguageRecommendation = generatePlainLanguageRecommendation(detectedSlot, newGearData, currentGear);
  const recommendationReasons = document.getElementById('recommendationReasons');
  if (recommendationReasons) {
    const comparisonDetails = generateDetailedComparison(currentGear, newGearData);
    recommendationReasons.innerHTML = `
      <p id="recommendationText">${recommendation.text}</p>
      <div class="plain-language-recommendation">
        <p><strong>Analysis:</strong> ${plainLanguageRecommendation}</p>
      </div>
      <div class="recommendation-details">
        <ul>
          ${recommendation.reasons.map(reason => `<li>• ${reason}</li>`).join('')}
        </ul>
      </div>
      <div class="comparison-details">
        <h4>Detailed Comparison:</h4>
        ${comparisonDetails}
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

// Generate detailed comparison between current and new gear
function generateDetailedComparison(currentGear, newGearData) {
  if (!currentGear) {
    return '<p>No current gear to compare against.</p>';
  }
  
  let comparisonHtml = '<div class="comparison-grid">';
  
  // Compare affixes
  comparisonHtml += '<div class="comparison-section">';
  comparisonHtml += '<h5>Affix Comparison:</h5>';
  
  const currentAffixes = currentGear.affixes || [];
  const newAffixes = newGearData.affixes || [];
  
  // Find matching affixes
  const matchingAffixes = [];
  const currentOnly = [];
  const newOnly = [];
  
  currentAffixes.forEach(currentAffix => {
    const currentStat = typeof currentAffix === 'object' ? currentAffix.stat : currentAffix;
    const found = newAffixes.find(newAffix => {
      const newStat = typeof newAffix === 'object' ? newAffix.stat : newAffix;
      return currentStat.toLowerCase().includes(newStat.toLowerCase()) || 
             newStat.toLowerCase().includes(currentStat.toLowerCase());
    });
    
    if (found) {
      matchingAffixes.push({ current: currentAffix, new: found });
    } else {
      currentOnly.push(currentAffix);
    }
  });
  
  newAffixes.forEach(newAffix => {
    const newStat = typeof newAffix === 'object' ? newAffix.stat : newAffix;
    const found = currentAffixes.find(currentAffix => {
      const currentStat = typeof currentAffix === 'object' ? currentAffix.stat : currentAffix;
      return currentStat.toLowerCase().includes(newStat.toLowerCase()) || 
             newStat.toLowerCase().includes(currentStat.toLowerCase());
    });
    
    if (!found) {
      newOnly.push(newAffix);
    }
  });
  
  // Display matching affixes
  if (matchingAffixes.length > 0) {
    comparisonHtml += '<div class="matching-affixes"><strong>Matching Affixes:</strong><ul>';
    matchingAffixes.forEach(({ current, new: newAffix }) => {
      const currentVal = typeof current === 'object' ? current.val : 'N/A';
      const newVal = typeof newAffix === 'object' ? newAffix.val : 'N/A';
      const currentStat = typeof current === 'object' ? current.stat : current;
      const change = currentVal !== newVal ? ` → ${newVal}` : ' (same)';
      comparisonHtml += `<li>${currentStat}: ${currentVal}${change}</li>`;
    });
    comparisonHtml += '</ul></div>';
  }
  
  // Display unique affixes
  if (currentOnly.length > 0) {
    comparisonHtml += '<div class="current-only"><strong>Current Only:</strong><ul>';
    currentOnly.forEach(affix => {
      const stat = typeof affix === 'object' ? affix.stat : affix;
      const val = typeof affix === 'object' ? affix.val : '';
      comparisonHtml += `<li>${stat}${val ? ': ' + val : ''}</li>`;
    });
    comparisonHtml += '</ul></div>';
  }
  
  if (newOnly.length > 0) {
    comparisonHtml += '<div class="new-only"><strong>New Only:</strong><ul>';
    newOnly.forEach(affix => {
      const stat = typeof affix === 'object' ? affix.stat : affix;
      const val = typeof affix === 'object' ? affix.val : '';
      comparisonHtml += `<li>${stat}${val ? ': ' + val : ''}</li>`;
    });
    comparisonHtml += '</ul></div>';
  }
  
  comparisonHtml += '</div>';
  
  // Compare aspects
  comparisonHtml += '<div class="comparison-section">';
  comparisonHtml += '<h5>Aspect Comparison:</h5>';
  
  const currentAspects = currentGear.aspects || [];
  const newAspects = newGearData.aspects || [];
  
  if (currentAspects.length > 0 || newAspects.length > 0) {
    if (currentAspects.length > 0) {
      comparisonHtml += '<div class="current-aspects"><strong>Current Aspects:</strong><ul>';
      currentAspects.forEach(aspect => {
        comparisonHtml += `<li>${aspect}</li>`;
      });
      comparisonHtml += '</ul></div>';
    }
    
    if (newAspects.length > 0) {
      comparisonHtml += '<div class="new-aspects"><strong>New Aspects:</strong><ul>';
      newAspects.forEach(aspect => {
        comparisonHtml += `<li>${aspect}</li>`;
      });
      comparisonHtml += '</ul></div>';
    }
  } else {
    comparisonHtml += '<p>No aspects on either item.</p>';
  }
  
  comparisonHtml += '</div>';
  
  // Compare item details
  comparisonHtml += '<div class="comparison-section">';
  comparisonHtml += '<h5>Item Details:</h5>';
  
  const details = [];
  if (currentGear.itemLevel && newGearData.itemLevel) {
    details.push(`Item Level: ${currentGear.itemLevel} → ${newGearData.itemLevel}`);
  }
  if (currentGear.rarity && newGearData.rarity) {
    details.push(`Rarity: ${currentGear.rarity} → ${newGearData.rarity}`);
  }
  if (currentGear.type && newGearData.type) {
    details.push(`Type: ${currentGear.type} → ${newGearData.type}`);
  }
  
  if (details.length > 0) {
    comparisonHtml += '<ul>';
    details.forEach(detail => comparisonHtml += `<li>${detail}</li>`);
    comparisonHtml += '</ul>';
  } else {
    comparisonHtml += '<p>No item details to compare.</p>';
  }
  
  comparisonHtml += '</div>';
  comparisonHtml += '</div>';
  
  return comparisonHtml;
}

// Generate plain language recommendation
function generatePlainLanguageRecommendation(slot, newGearData, currentGear) {
  const currentScore = currentGear ? (currentGear.score || 0) : 0;
  const newScore = newGearData.score;
  const scoreDiff = newScore - currentScore;
  
  // Get slot-specific context
  const slotName = slot.charAt(0).toUpperCase() + slot.slice(1);
  
  if (newScore >= 90) {
    return `This ${slotName.toLowerCase()} is exceptional for your Hydra Sorcerer build. With a score of ${newScore}/100, it's significantly better than your current gear and represents BiS (Best in Slot) material. The combination of affixes and aspects makes this perfect for endgame content and high-tier pushing.`;
  } else if (newScore >= 80) {
    if (scoreDiff > 5) {
      return `This ${slotName.toLowerCase()} is a solid upgrade for your Hydra build. Scoring ${newScore}/100 vs your current ${currentScore}/100, it provides a ${scoreDiff}-point improvement. The affixes and aspects align well with Hydra Sorcerer priorities, making it great for speed farming and general content.`;
    } else {
      return `This ${slotName.toLowerCase()} is good quality but doesn't significantly improve your current setup. While it scores ${newScore}/100, your current gear at ${currentScore}/100 is actually better. Consider keeping this as backup or for alternative builds.`;
    }
  } else if (newScore >= 70) {
    if (scoreDiff > 10) {
      return `This ${slotName.toLowerCase()} offers a moderate upgrade for your Hydra build. With a score of ${newScore}/100 vs your current ${currentScore}/100, it's ${scoreDiff} points better. While not exceptional, it's decent for mid-tier content and provides some improvement.`;
    } else {
      return `This ${slotName.toLowerCase()} is mediocre compared to your current gear. Scoring ${newScore}/100 vs your current ${currentScore}/100, it's ${Math.abs(scoreDiff)} points worse. The affixes and aspects don't align well with Hydra Sorcerer priorities.`;
    }
  } else if (newScore >= 50) {
    if (scoreDiff > 15) {
      return `This ${slotName.toLowerCase()} is a minor upgrade despite its low score. At ${newScore}/100 vs your current ${currentScore}/100, it's ${scoreDiff} points better. Only switch if you need an immediate improvement, as this won't significantly enhance your Hydra build.`;
    } else {
      return `This ${slotName.toLowerCase()} is poor quality and not suitable for your Hydra Sorcerer build. Scoring only ${newScore}/100 vs your current ${currentScore}/100, it's ${Math.abs(scoreDiff)} points worse. The affixes and aspects don't support Hydra gameplay effectively.`;
    }
  } else {
    return `This ${slotName.toLowerCase()} is very poor quality and should be salvaged. With a score of only ${newScore}/100 vs your current ${currentScore}/100, it's ${Math.abs(scoreDiff)} points worse. The affixes and aspects are completely unsuitable for a Hydra Sorcerer build.`;
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
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing...');
  
  // Ensure modal is hidden on page load
  const gearModal = document.getElementById('gearModal');
  if (gearModal) {
    gearModal.classList.add('hidden');
    console.log('Gear modal hidden on page load');
    
    // Double-check it's hidden
    setTimeout(() => {
      if (!gearModal.classList.contains('hidden')) {
        console.log('Modal was shown - hiding it again');
        gearModal.classList.add('hidden');
      }
    }, 100);
  }
  
  // Close modal function
  function closeGearModal() {
    if (gearModal) {
      gearModal.classList.add('hidden');
      console.log('Gear modal closed');
    }
  }
  
  // Show modal function
  function showGearModalProper(slot) {
    if (!slot || !build[slot]) {
      console.log('Cannot show modal - no valid slot or gear data');
      return;
    }
    
    if (gearModal) {
      gearModal.classList.remove('hidden');
      console.log('Gear modal shown for slot:', slot);
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
  
  // Add click outside modal to close
  if (gearModal) {
    gearModal.addEventListener('click', (e) => {
      if (e.target === gearModal) {
        closeGearModal();
      }
    });
  }
  
  // Add escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeGearModal();
      hideAffixDetails();
    }
  });
  
  // Set up tab switching
  const tabButtons = document.querySelectorAll('#tabs button');
  const tabSections = document.querySelectorAll('.tab');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      console.log('Tab button clicked:', button.dataset.tab);
      const targetTab = button.dataset.tab;
      
      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update active tab section
      tabSections.forEach(section => section.classList.remove('active'));
      const targetSection = document.getElementById(targetTab);
      if (targetSection) {
        targetSection.classList.add('active');
        console.log('Switched to tab:', targetTab);
      }
    });
  });
  
  // Set up gear slot click handlers
  SLOTS.forEach(slot => {
    const slotElement = document.querySelector(`[data-slot="${slot}"]`);
    if (slotElement) {
      const gearName = slotElement.querySelector('.gear-name');
      if (gearName) {
        gearName.addEventListener('click', (event) => {
          console.log('=== Gear name clicked ===');
          console.log('Slot:', slot);
          console.log('Event:', event);
          console.log('Build data for slot:', build[slot]);
          
          if (build[slot] && build[slot].name && build[slot].name !== 'No gear equipped') {
            console.log('Showing modal for valid gear');
            showGearModalProper(slot);
            showGearModal(slot); // This populates the content
          } else {
            console.log('No valid gear data for slot:', slot);
          }
        });
      }
    }
  });
  
  // Set up Add Gear buttons
  const addGearButtons = document.querySelectorAll('.add-gear-btn');
  addGearButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      console.log('Add gear button clicked');
      e.preventDefault();
      e.stopPropagation();
      
      const slotElement = btn.closest('[data-slot]');
      if (slotElement) {
        const slot = slotElement.dataset.slot;
        console.log('Adding gear for slot:', slot);
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
  
  // Initialize affixes interface
  await initializeAffixesInterface();
});

// Affixes Interface Functionality
let currentAffixSlot = null;
let affixData = null;

// Load affix data from rulepack
async function loadAffixData() {
  try {
    console.log('Loading affix data...');
    const response = await fetch('rulepack.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    affixData = await response.json();
    console.log('Affix data loaded successfully:', affixData);
    console.log('Available slots:', Object.keys(affixData.slots || {}));
  } catch (error) {
    console.error('Failed to load affix data:', error);
    // Fallback to JSON display
    document.getElementById('affix-json-fallback').classList.remove('hidden');
  }
}

// Initialize affixes interface
async function initializeAffixesInterface() {
  console.log('Initializing affixes interface...');
  
  // Wait for affix data to load
  if (!affixData) {
    console.log('Waiting for affix data to load...');
    await loadAffixData();
  }
  
  // Set up gear option click handlers
  const gearOptions = document.querySelectorAll('.gear-option');
  console.log('Found gear options:', gearOptions.length);
  
  gearOptions.forEach(option => {
    option.addEventListener('click', () => {
      const slot = option.dataset.slot;
      console.log('Gear option clicked:', slot);
      selectGearSlot(slot);
    });
  });

  // Set up close button
  const closeBtn = document.getElementById('closeAffixDetails');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('Close affix details clicked');
      hideAffixDetails();
    });
  }
  
  console.log('Affixes interface initialized');
}

// Select a gear slot and show affix details
function selectGearSlot(slot) {
  console.log('selectGearSlot called with slot:', slot);
  currentAffixSlot = slot;
  
  // Update active state
  document.querySelectorAll('.gear-option').forEach(option => {
    option.classList.remove('active');
  });
  const selectedOption = document.querySelector(`[data-slot="${slot}"]`);
  if (selectedOption) {
    selectedOption.classList.add('active');
    console.log('Gear option activated:', slot);
  }
  
  // Show affix details
  showAffixDetails(slot);
}

// Show affix details for selected slot
function showAffixDetails(slot) {
  console.log('showAffixDetails called with slot:', slot);
  console.log('affixData available:', !!affixData);
  
  if (!affixData || !affixData.slots) {
    console.error('Affix data not loaded');
    alert('Affix data not loaded. Please refresh the page.');
    return;
  }

  console.log('Available slots in affixData:', Object.keys(affixData.slots));

  // Get slot data (handle both ring1/ring2 and ring)
  let slotData = affixData.slots[slot];
  console.log('Direct slot data:', slotData);
  
  if (!slotData && (slot === 'ring1' || slot === 'ring2')) {
    slotData = affixData.slots['Ring1'] || affixData.slots['Ring2'];
    console.log('Ring fallback data:', slotData);
  }
  if (!slotData) {
    slotData = affixData.slots[slot.charAt(0).toUpperCase() + slot.slice(1)];
    console.log('Capitalized slot data:', slotData);
  }

  if (!slotData) {
    console.error('No data found for slot:', slot);
    alert(`No affix data found for ${slot}. Please check the rulepack.json file.`);
    return;
  }

  console.log('Final slot data:', slotData);

  // Update title
  const title = document.getElementById('affixSlotTitle');
  title.textContent = `${getSlotDisplayName(slot)} Affixes`;

  // Populate Best in Slot items
  populateBisItems(slotData.bis || []);

  // Populate Mandatory Affixes
  populateAffixList('mandatoryAffixes', slotData.mandatoryAffixes || [], 'mandatory');

  // Populate Preferred Affixes
  populateAffixList('preferredAffixes', slotData.preferredAffixes || [], 'preferred');

  // Populate Tempering Options
  populateAffixList('temperingOptions', slotData.tempering || [], 'tempering');

  // Populate Aspects
  populateAspects(slotData.aspects || []);

  // Populate Enchantment Targets
  populateEnchantments(slotData.enchantTargets || []);

  // Populate Build Notes
  populateBuildNotes(slot);

  // Show the details panel
  document.getElementById('affixDetails').classList.remove('hidden');
}

// Hide affix details
function hideAffixDetails() {
  document.getElementById('affixDetails').classList.add('hidden');
  document.querySelectorAll('.gear-option').forEach(option => {
    option.classList.remove('active');
  });
  currentAffixSlot = null;
}

// Get display name for slot
function getSlotDisplayName(slot) {
  const slotNames = {
    'helm': 'Helm',
    'amulet': 'Amulet',
    'chest': 'Chest',
    'gloves': 'Gloves',
    'pants': 'Pants',
    'boots': 'Boots',
    'ring': 'Ring',
    'ring1': 'Ring 1',
    'ring2': 'Ring 2',
    'weapon': 'Weapon',
    'offhand': 'Off-hand'
  };
  return slotNames[slot] || slot;
}

// Populate Best in Slot items
function populateBisItems(bisItems) {
  const container = document.getElementById('bisItems');
  container.innerHTML = '';

  bisItems.forEach(item => {
    const isUnique = item.includes('(Unique)');
    const div = document.createElement('div');
    div.className = `bis-item ${isUnique ? 'unique' : ''}`;
    
    const name = document.createElement('div');
    name.className = 'bis-item-name';
    name.textContent = item.replace(' (Unique)', '').replace(' (Alternative)', '');
    
    const desc = document.createElement('div');
    desc.className = 'bis-item-desc';
    if (isUnique) {
      desc.textContent = 'Unique Item - Best in Slot';
    } else if (item.includes('(Alternative)')) {
      desc.textContent = 'Alternative Option';
    } else {
      desc.textContent = 'Best in Slot Item';
    }
    
    div.appendChild(name);
    div.appendChild(desc);
    container.appendChild(div);
  });
}

// Populate affix list
function populateAffixList(containerId, affixes, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  affixes.forEach((affix, index) => {
    const div = document.createElement('div');
    div.className = 'affix-item';
    
    const name = document.createElement('div');
    name.className = 'affix-name';
    name.textContent = affix;
    
    const priority = document.createElement('div');
    priority.className = 'affix-priority';
    priority.textContent = type === 'mandatory' ? 'Required' : 
                          type === 'preferred' ? 'Preferred' : 'Temper';
    
    div.appendChild(name);
    div.appendChild(priority);
    container.appendChild(div);
  });
}

// Populate aspects
function populateAspects(aspects) {
  const container = document.getElementById('recommendedAspects');
  container.innerHTML = '';

  aspects.forEach(aspect => {
    const div = document.createElement('div');
    div.className = 'aspect-item';
    
    const name = document.createElement('div');
    name.className = 'aspect-name';
    name.textContent = aspect;
    
    const desc = document.createElement('div');
    desc.className = 'aspect-desc';
    desc.textContent = getAspectDescription(aspect);
    
    div.appendChild(name);
    div.appendChild(desc);
    container.appendChild(div);
  });
}

// Get aspect description
function getAspectDescription(aspectName) {
  const descriptions = {
    'Snowveiled Aspect': 'Ice Armor makes you unstoppable and grants 25% Damage Reduction for 3.5-5.5 seconds.',
    'Aspect of Shredding Blades': 'Ice Blades chance to apply Vulnerable increased by 20% and duration increased by 4 seconds. Gain 15-35% Vulnerable Damage.',
    'Aspect of Concentration': 'Casting a Conjuration Skill grants 15-25% Damage Reduction for 5 seconds.',
    'Flash Fire Aspect': 'Increases Critical Strike Damage of Pyromancy Skills by 25-45%. Double this bonus against Healthy targets.',
    'Everliving Aspect': 'Take 10-30% less damage from Crowd Controlled or Vulnerable enemies.',
    'Aspect of the Orange Herald': 'Lucky Hit: Up to 5-13% chance when damaging enemies to reduce Ultimate Skill cooldown by 2 seconds.',
    'Conceited Aspect': 'Deal 10-30% increased damage while you have a Barrier active.',
    'Battle Caster\'s Aspect': 'Lucky Hit: 25-45% chance when Conjuration Skills hit to gain +1 Rank to Conjuration skills for 12 seconds (stacks up to 10 times).',
    'Serpentine Aspect': 'Hydras deal 0.5-1.5% increased damage per Mana you had when Summoned. Casting Hydra consumes all Mana.',
    'Storm Swell Aspect': 'Deal 15-35% increased damage while Ice Armor is active. Increased by another 15% against Frozen enemies.'
  };
  return descriptions[aspectName] || 'Legendary Aspect for this slot.';
}

// Populate enchantment targets
function populateEnchantments(enchantments) {
  const container = document.getElementById('enchantmentTargets');
  container.innerHTML = '';

  enchantments.forEach(enchantment => {
    const div = document.createElement('div');
    div.className = 'enchantment-item';
    
    const icon = document.createElement('div');
    icon.className = 'enchantment-icon';
    icon.textContent = '🔧';
    
    const text = document.createElement('div');
    text.className = 'enchantment-text';
    text.textContent = enchantment;
    
    div.appendChild(icon);
    div.appendChild(text);
    container.appendChild(div);
  });
}

// Populate build notes
function populateBuildNotes(slot) {
  const container = document.getElementById('buildNotes');
  container.innerHTML = '';

  if (!affixData.buildNotes) return;

  // Add slot-specific notes
  const slotNotes = getSlotSpecificNotes(slot);
  if (slotNotes) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'build-note';
    
    const title = document.createElement('div');
    title.className = 'build-note-title';
    title.textContent = `${getSlotDisplayName(slot)} Specific Notes`;
    
    const content = document.createElement('div');
    content.className = 'build-note-content';
    content.textContent = slotNotes;
    
    noteDiv.appendChild(title);
    noteDiv.appendChild(content);
    container.appendChild(noteDiv);
  }

  // Add general build notes
  Object.entries(affixData.buildNotes).forEach(([category, notes]) => {
    if (Array.isArray(notes) && notes.length > 0) {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'build-note';
      
      const title = document.createElement('div');
      title.className = 'build-note-title';
      title.textContent = getCategoryDisplayName(category);
      
      const content = document.createElement('div');
      content.className = 'build-note-content';
      content.textContent = notes.join('. ');
      
      noteDiv.appendChild(title);
      noteDiv.appendChild(content);
      container.appendChild(noteDiv);
    }
  });
}

// Get slot-specific notes
function getSlotSpecificNotes(slot) {
  const slotNotes = {
    'helm': 'Harlequin Crest enables 1.5s Evade Teleport breakpoint for speed farming.',
    'amulet': 'Ophidian Iris is the new Season 9 unique that creates gigantic Hydras with exploding attacks.',
    'chest': 'Raiment of the Infinite groups and stuns enemies when you Teleport on top of them.',
    'pants': 'Axial Conduit provides boosted Resource Generation with Greater Affix and Masterworking bonuses.',
    'boots': 'Target Evade Cooldown Reduction for speed farming. Implicit stat: Attacks Reduce Evade\'s Cooldown by 1.5 Seconds.',
    'ring1': 'Tal Rasha\'s Iridescent Loop gains buffs from Ice Armor, Teleport, and Hydra casts.',
    'weapon': 'Serpentine Aspect consumes all Mana to increase Hydra damage. High Maximum Mana is crucial.',
    'offhand': 'Focus setup preferred for speed farming, Staff for higher damage output.'
  };
  return slotNotes[slot];
}

// Get category display name
function getCategoryDisplayName(category) {
  const names = {
    'keyMechanics': 'Key Build Mechanics',
    'resourceManagement': 'Resource Management',
    'criticalStrike': 'Critical Strike Setup',
    'speedFarming': 'Speed Farming Setup'
  };
  return names[category] || category;
}

// Initialize affixes interface
async function initializeAffixes() {
  await loadAffixData();
  initializeAffixesInterface();
}
