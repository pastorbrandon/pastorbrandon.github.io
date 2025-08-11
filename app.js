// ---------- Tabs ----------
const gearTabBtn  = document.getElementById('tab-gear');
const toolsTabBtn = document.getElementById('tab-tools');
const gearTab  = document.getElementById('gearTab');
const toolsTab = document.getElementById('toolsTab');
gearTabBtn?.addEventListener('click', () => { gearTab.classList.add('active'); toolsTab.classList.remove('active'); gearTabBtn.classList.add('active'); toolsTabBtn.classList.remove('active'); });
toolsTabBtn?.addEventListener('click', () => { toolsTab.classList.add('active'); gearTab.classList.remove('active'); toolsTabBtn.classList.add('active'); gearTabBtn.classList.remove('active'); });

// ---------- Constants ----------
const APP_VERSION = 'v2';
const SLOTS = ['helm','amulet','ring1','ring2','weapon','offhand','chest','gloves','pants','boots'];

// Point to Netlify function in prod; fallback absolute URL if hosted elsewhere.
const FN_URL = location.hostname.endsWith('netlify.app')
  ? '/.netlify/functions/analyze-gear'
  : 'https://d4companion.netlify.app/.netlify/functions/analyze-gear';

// ---------- Storage (text-only) ----------
const STORAGE_KEY = 'hc-build-v2';
function saveBuild(b){ localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }
function loadBuild(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }
let build = loadBuild();

// ---------- Rules loader ----------
let RULES = null;
async function ensureRules(){
  if (RULES) return RULES;
  try { const r = await fetch('rulepack.json'); RULES = await r.json(); }
  catch { RULES = { slots:{} }; }
  return RULES;
}

// ---------- UI helpers ----------
function setSlotStatus(slot, text){
  document.querySelector(`.slot[data-slot="${slot}"] .status`)?.replaceChildren(text);
}
function renderSlot(slot){
  const d = build[slot];
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!el) return;
  const nameEl = el.querySelector('.gear-name');
  const statusEl = el.querySelector('.status');
  if (!d) {
    nameEl.textContent = '—'; nameEl.className = 'gear-name';
    statusEl.textContent = '—'; statusEl.className = 'status';
    return;
  }
  nameEl.textContent = d.name || '(unnamed)';
  nameEl.className = 'gear-name ' + (d.status ? d.status.toLowerCase() : '');
  statusEl.textContent = d.status || 'Unscored';
}
function renderAll(){ SLOTS.forEach(renderSlot); }
document.getElementById('appVersion')?.replaceChildren(APP_VERSION);

// ---------- Modal safety (never sticky) ----------
function closeGearModal(){ document.getElementById('gearModal')?.classList.add('hidden'); }
(function initModalSafety(){
  closeGearModal();
  document.getElementById('closeModal')?.addEventListener('click', closeGearModal);
  document.getElementById('gearModal')?.addEventListener('click', (e)=>{ if (e.target === e.currentTarget) closeGearModal(); });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeGearModal(); });
})();

// ---------- Image helpers ----------
async function pickImageFile(capture=true){
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (capture) input.capture = 'environment';
    input.onchange = () => res(input.files?.[0] || null);
    input.click();
  });
}
async function fileToDataUrl(file, max=1280, q=0.85){
  const raw = await new Promise(r => { const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(file); });
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width, h=img.height;
      if (w>h && w>max){ h=Math.round(h*(max/w)); w=max; }
      else if (h>=w && h>max){ w=Math.round(w*(max/h)); h=max; }
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      res(c.toDataURL('image/jpeg', q));
    };
    img.src = raw;
  });
}

// ---------- Function call ----------
async function analyzeWithGPT(dataUrl, slotHint, rules){
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ image: dataUrl, slot: slotHint, rules })
  });
  const text = await res.text();
  if (!res.ok){
    try { const j = JSON.parse(text); throw new Error(j.error || text); }
    catch { throw new Error(text || `HTTP ${res.status}`); }
  }
  try { return JSON.parse(text); }
  catch { throw new Error('Bad JSON from function: ' + text.slice(0,200)); }
}

// ---------- Compare helper ----------
const STATUS_RANK = { Blue:3, Green:2, Yellow:1, Red:0 };
function compareItems(newItem, currentItem){
  if (!currentItem) return { decision:'equip', reason:'No item equipped' };
  const a = STATUS_RANK[newItem.status] ?? -1;
  const b = STATUS_RANK[currentItem.status] ?? -1;
  if (a > b) return { decision:'equip', reason:`${newItem.status} > ${currentItem.status}` };
  if (a < b) return { decision:'salvage', reason:`${newItem.status} < ${currentItem.status}` };
  const ns = Number(newItem.score ?? 0), cs = Number(currentItem.score ?? 0);
  if (ns > cs + 2) return { decision:'equip', reason:`score ${ns} > ${cs}` };
  if (ns < cs - 2) return { decision:'salvage', reason:`score ${ns} < ${cs}` };
  return { decision:'keep', reason:'similar quality' };
}

// ---------- Flows ----------
async function equipFlow(slot){
  const file = await pickImageFile(true);
  if (!file) return;
  try {
    await ensureRules();
    setSlotStatus(slot, 'Analyzing…');
    const dataUrl = await fileToDataUrl(file, 1280, 0.85);
    const report = await analyzeWithGPT(dataUrl, slot, RULES);
    build[slot] = {
      name: report.name || 'Unknown Item',
      slot,
      rarity: report.rarity || '',
      type: report.type || '',
      aspect: report.aspect || null,
      affixes: report.affixes || [],
      aspects: report.aspects || [],
      status: report.status || 'Yellow',
      score: report.score ?? null,
      reasons: report.reasons || [],
      improvements: report.improvements || [],
      lastSeen: Date.now()
    };
    saveBuild(build); renderSlot(slot);
    setSlotStatus(slot, report.status || 'Equipped');
  } catch (e) {
    setSlotStatus(slot, 'Error'); alert('Error equipping gear: ' + (e.message || e));
  }
}

async function checkNewGear(){
  const file = await pickImageFile(true);
  if (!file) return;
  try {
    await ensureRules();
    const dataUrl = await fileToDataUrl(file, 1280, 0.85);
    const report = await analyzeWithGPT(dataUrl, 'auto', RULES);
    let slot = (report.slot || '').toLowerCase();
    if (!SLOTS.includes(slot)) slot = prompt('Which slot is this item for?', 'helm')?.toLowerCase() || 'helm';
    const current = build[slot];
    const cmp = compareItems(report, current);
    const msg =
      `${report.name} → ${slot}\n` +
      `Grade: ${report.status}${report.score!=null?` (${report.score}/100)`:''}\n` +
      `Suggested: ${cmp.decision.toUpperCase()} (${cmp.reason})\n\n` +
      (report.improvements?.length ? `Improvements:\n- ${report.improvements.join('\n- ')}\n\n` : '') +
      `Equip now?`;
    if (cmp.decision === 'equip' && confirm(msg)) {
      build[slot] = {
        name: report.name, slot,
        rarity: report.rarity, type: report.type,
        aspect: report.aspect || null,
        affixes: report.affixes || [],
        aspects: report.aspects || [],
        status: report.status, score: report.score ?? null,
        reasons: report.reasons || [], improvements: report.improvements || [],
        lastSeen: Date.now()
      };
      saveBuild(build); renderSlot(slot);
      alert(`${report.name} equipped to ${slot}.`);
    } else if (cmp.decision === 'keep') {
      alert('Keep for now (not auto-equipped).');
    } else {
      alert('Worse than current—consider salvaging.');
    }
  } catch (e) {
    alert('Error analyzing gear: ' + (e.message || e));
  }
}

// ---------- Wire buttons ----------
document.getElementById('btn-check-gear')?.addEventListener('click', checkNewGear);
SLOTS.forEach(slot => {
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  el?.querySelector('.add-gear')?.addEventListener('click', () => equipFlow(slot));
  el?.querySelector('.details')?.addEventListener('click', () => {
    const d = build[slot];
    if (!d) return alert('No item in this slot yet.');
    const body =
      `Rarity: ${d.rarity || '—'}\nType: ${d.type || '—'}\nStatus: ${d.status || 'Unscored'}\n` +
      (d.aspect ? `\nAspect: ${d.aspect.name || '—'}\n${d.aspect.text || ''}\n` : '') +
      (Array.isArray(d.affixes) && d.affixes.length ? `\nAffixes:\n- ${d.affixes.map(a => `${a.stat}: ${a.val ?? ''}${a.unit ?? ''}`).join('\n- ')}` : '') +
      (Array.isArray(d.improvements) && d.improvements.length ? `\n\nHow to reach Blue:\n- ${d.improvements.join('\n- ')}` : '') +
      (Array.isArray(d.reasons) && d.reasons.length ? `\n\nWhy graded:\n- ${d.reasons.join('\n- ')}` : '');
    document.getElementById('detailsTitle').textContent = d.name || slot;
    document.getElementById('detailsBody').textContent = body;
    document.getElementById('gearModal')?.classList.remove('hidden');
  });
});

// ---------- Backup / Restore ----------
document.getElementById('btn-backup')?.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(build||{}, null, 2)], {type:'application/json'}));
  a.download = `horadric-build-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove();
});
document.getElementById('btn-restore')?.addEventListener('click', () => {
  const input = document.createElement('input'); input.type='file'; input.accept='application/json';
  input.onchange = () => {
    const f = input.files?.[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { try { build = JSON.parse(fr.result); saveBuild(build); renderAll(); alert('Build restored.'); } catch { alert('Invalid file.'); } };
    fr.readAsText(f);
  };
  input.click();
});

// ---------- Service worker (disable in dev; enable only on prod hosts) ----------
if ('serviceWorker' in navigator && (location.hostname.endsWith('netlify.app') || location.hostname.endsWith('github.io'))) {
  navigator.serviceWorker.register('/service-worker.js');
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
}

// ---------- Boot ----------
renderAll();
ensureRules();
