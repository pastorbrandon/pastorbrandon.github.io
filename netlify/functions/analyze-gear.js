// /.netlify/functions/analyze-gear
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Enhanced system prompt for better Diablo 4 gear analysis
const PROMPT_SYSTEM = `
You are a Diablo 4 gear analyst for a Hydra Sorcerer.
Job: read ONE item screenshot and return STRICT JSON only (no prose). Think silently; output only JSON.

CRITICAL: Return ONLY raw JSON. Do NOT wrap in markdown code blocks (no \`\`\`json). Do NOT add any formatting, comments, or prose. Just the JSON object.

How to parse the UI:
- Title line: the item name. Text color hints rarity:
  • Orange ≈ Legendary  • Gold/Yellow ≈ Unique  • (If "Mythic" ever appears, treat as top-tier like Unique.)
- Subheader often shows tier/type, e.g. "Ancestral Legendary Helm" or "Ancestral Unique Boots".
- "Imprinted:" line = an imprinted Aspect (from Codex or extracted). If there's no "Imprinted" and it's a Unique, the special power is the base unique aspect.
- Affixes are the bullet list with +numbers (% or flat). Blue-colored numbers typically indicate a GREATER affix roll.
- Masterworking/Tempering: look for "Masterwork: X/Y" and "Tempers: X/Y".
- Sockets/gems may appear as icons; if readable, include a short gem list, else leave empty.
- Example affixes: "Cooldown Reduction", "Lucky Hit Chance", "+ to Hydra", "Hydra Lucky Hit Chance", "Maximum Life", Resistances, Armor, etc.

Normalization rules (very important):
- Normalize names to the shortest canonical form used in guides (and in RULES). Examples:
  "Cooldown Reduction" → "Cooldown Reduction"
  "Lucky Hit Chance" → "Lucky Hit Chance"
  "+4 to Hydra" → "Hydra Ranks"
  "Hydra Lucky Hit Chance" → "Lucky Hit Chance (Hydra)"
- Parse numeric values to numbers and separate the unit. "12.9%" → { val:12.9, unit:"%" } ; "+4" → { val:4, unit:null }.
- Mark affix.greater=true when the value text appears blue (or otherwise labeled as a Greater affix).
- Aspect:
  • imprinted: { source:"imprinted", name:best guess or null, text:full effect text }
  • unique base: { source:"unique_base", name:best guess (e.g., "Yen's Blessing"), text:full effect }
- Rarity: "Legendary" or "Unique" (use the color + wording to decide).
- Handle typos and OCR artifacts robustly. Prefer layout structure over raw characters.

Grading policy:
- Use ONLY the provided RULES for the given slot (affix priorities, aspects, tempering lines, thresholds).
- If Icy Veins and Maxroll differ, prefer Icy Veins; if still tied, choose the safer option and explain in 'reasons'.
- Status bands: Blue=BiS, Green=Right item but needs work, Yellow=Viable, Red=Replace ASAP.
- Provide actionable 'improvements' to reach Blue (missing mandatories, better aspect, tempering lines, reroll/masterwork tips).

REQUIRED JSON STRUCTURE:
{
  "name": "Item Name",
  "slot": "helm|amulet|chest|gloves|pants|boots|ring|weapon|offhand",
  "rarity": "Legendary|Unique|Mythic|Unknown",
  "type": "Ancestral Legendary Helm",
  "item_power": 925,
  "armor": 450,
  "aspect": {
    "name": "Aspect Name",
    "source": "imprinted|unique_base|unknown",
    "text": "Full aspect description"
  },
  "affixes": [
    {
      "stat": "Cooldown Reduction",
      "val": 12.5,
      "unit": "%",
      "greater": false,
      "tempered": false
    }
  ],
  "masterwork": {
    "rank": 2,
    "max": 5
  },
  "tempers": {
    "used": 1,
    "max": 2
  },
  "sockets": 1,
  "gems": ["Royal Diamond"],
  "status": "Blue|Green|Yellow|Red",
  "score": 95,
  "reasons": ["Reason 1", "Reason 2"],
  "improvements": ["Improvement 1", "Improvement 2"],
  "confidence": 0.95
}

IMPORTANT: For missing or unclear data, use these defaults:
- item_power: null (if not visible)
- armor: null (if not visible)
- masterwork: { rank: null, max: null } (if not visible)
- tempers: { used: null, max: null } (if not visible)
- sockets: null (if not visible)
- gems: [] (empty array if not visible)
- confidence: 0.5 (if uncertain) to 1.0 (if very clear)

Return ONLY the raw JSON object. No markdown, no code blocks, no formatting. Just the JSON.
`;

// Build messages with slot-specific rules
function buildMessages({ image, slot, rules }) {
  // Only pass the rules for this slot to cut tokens and sharpen grading
  const slotKey = (slot || "").toString().trim().toLowerCase();
  const rulesForSlot = rules?.slots?.[slotKey] || rules?.slots?.[slotKey?.charAt(0).toUpperCase()+slotKey?.slice(1)] || {};
  return [
    { role:"system", content: PROMPT_SYSTEM },
    {
      role:"user",
      content: [
        { type:"text", text:
          `Task: extract, normalize, and grade this Diablo 4 item for a Hydra Sorcerer.
           Prefer Icy Veins over Maxroll when in conflict. Return STRICT JSON only.` },
        { type:"image_url", image_url: { url: image } },
        { type:"text", text: `Slot hint: ${slot || "unknown"}` },
        { type:"text", text: `RULES for slot (JSON):\n${JSON.stringify(rulesForSlot || {})}` }
      ]
    }
  ];
}

// Retry helper for API calls
async function withRetry(fn, tries = 3) {
  try { return await fn(); }
  catch (err) {
    const s = err.status || err?.response?.status;
    if (tries > 1 && (s === 429 || s === 500 || s === 503)) {
      await new Promise(r => setTimeout(r, (4 - tries) * 700));
      return withRetry(fn, tries - 1);
    }
    throw err;
  }
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: CORS };

  try {
    const { image, slot, rules } = JSON.parse(event.body || "{}");
    if (!image) throw new Error("Missing 'image' (dataURL).");

    const messages = buildMessages({ image, slot, rules });
    
    console.log('Attempting analysis with enhanced instructions...');
    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 800, // Increased for more detailed responses
      temperature: 0.05 // Very low temperature for consistent, precise responses
    }));
    console.log('Analysis successful');

    const content = resp.choices?.[0]?.message?.content || "{}";
    
    // Clean the response content - remove markdown formatting if present
    let cleanedContent = content.trim();
    
    // Remove markdown code blocks if present
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Validate the response is valid JSON
    try {
      JSON.parse(cleanedContent);
    } catch (jsonError) {
      console.error('Invalid JSON response:', cleanedContent);
      console.error('Original response:', content);
      throw new Error(`Invalid JSON response from AI: ${jsonError.message}. Response: ${cleanedContent.substring(0, 200)}...`);
    }
    
    return { 
      statusCode: 200, 
      headers: { "Content-Type":"application/json", ...CORS }, 
      body: cleanedContent 
    };
  } catch (err) {
    console.error('Analysis error:', err);
    return { 
      statusCode: 400, 
      headers: { "Content-Type":"application/json", ...CORS }, 
      body: JSON.stringify({ 
        error: String(err),
        details: err.message || 'Unknown error occurred during analysis'
      }) 
    };
  }
};
