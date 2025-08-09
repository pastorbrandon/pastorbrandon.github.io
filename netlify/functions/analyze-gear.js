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

IMPORTANT: For missing or unclear data, use these defaults:
- item_power: null (if not visible)
- armor: null (if not visible)
- masterwork: { rank: null, max: null } (if not visible)
- tempers: { used: null, max: null } (if not visible)
- sockets: null (if not visible)
- gems: [] (empty array if not visible)
- confidence: 0.5 (if uncertain) to 1.0 (if very clear)

Return valid JSON that matches the schema exactly. If a field is unknown, include it with null or [] (do not omit required keys).
`;

// Stricter schema for structured outputs
const SCHEMA = {
  name: "GearReport",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name:      { type: "string" },
      slot:      { type: "string" },               // normalized slot: helm, amulet, boots, etc.
      rarity:    { type: "string", enum: ["Legendary","Unique","Mythic","Unknown"] },
      type:      { type: "string" },               // e.g., "Ancestral Legendary Helm"
      item_power:{ type: ["number","null"] },
      armor:     { type: ["number","null"] },

      aspect: {
        type: "object",
        additionalProperties: false,
        properties: {
          name:  { type: ["string","null"] },
          source:{ type: "string", enum: ["imprinted","unique_base","unknown"] },
          text:  { type: "string" }
        },
        required: ["name","source","text"]
      },

      affixes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            stat:    { type: "string" },           // normalized affix name
            val:     { type: ["number","null"] },
            unit:    { type: ["string","null"] },  // "%", "flat", null
            greater: { type: "boolean" },          // blue-number/greater roll
            tempered:{ type: "boolean" }           // if clearly tempered
          },
          required: ["stat","val","unit","greater","tempered"]
        }
      },

      masterwork: {
        type: "object",
        additionalProperties: false,
        properties: { rank: {type:["number","null"]}, max:{type:["number","null"]} },
        required: ["rank","max"]
      },
      tempers: {
        type: "object",
        additionalProperties: false,
        properties: { used:{type:["number","null"]}, max:{type:["number","null"]} },
        required: ["used","max"]
      },
      sockets: { type: ["number","null"] },
      gems:    { type: "array", items: { type:"string" } },

      // grading
      status:  { type: "string", enum:["Blue","Green","Yellow","Red"] },
      score:   { type: ["number","null"] },
      reasons: { type: "array", items: { type:"string" } },
      improvements: { type: "array", items: { type:"string" } },

      // debug/quality
      confidence: { type: ["number","null"] }  // 0..1 overall extraction confidence
    },
    required: [
      "name","slot","rarity","type","aspect","affixes","masterwork","tempers","sockets","gems",
      "status","score","reasons","improvements","confidence"
    ]
  }
};

// Fallback schema for when strict schema fails
const FALLBACK_SCHEMA = {
  name: "GearReport",
  schema: {
    type: "object",
    properties: {
      name:      { type: "string" },
      slot:      { type: "string" },
      rarity:    { type: "string" },
      type:      { type: "string" },
      item_power:{ type: ["number","null"] },
      armor:     { type: ["number","null"] },
      aspect:    { type: "object" },
      affixes:   { type: "array" },
      masterwork:{ type: "object" },
      tempers:   { type: "object" },
      sockets:   { type: ["number","null"] },
      gems:      { type: "array" },
      status:    { type: "string" },
      score:     { type: ["number","null"] },
      reasons:   { type: "array" },
      improvements: { type: "array" },
      confidence: { type: ["number","null"] }
    },
    required: ["name","slot","rarity","type","aspect","affixes","status","score","reasons","improvements"]
  }
};

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
    
    // Try with strict schema first
    let resp;
    try {
      console.log('Attempting analysis with strict schema...');
      resp = await withRetry(() => client.chat.completions.create({
        model: MODEL,
        messages,
        response_format: { type: "json_schema", json_schema: SCHEMA },
        max_tokens: 500,
        temperature: 0.2
      }));
      console.log('Strict schema analysis successful');
    } catch (strictError) {
      console.warn('Strict schema failed, trying fallback schema:', strictError.message);
      // Fallback to more lenient schema
      resp = await withRetry(() => client.chat.completions.create({
        model: MODEL,
        messages,
        response_format: { type: "json_schema", json_schema: FALLBACK_SCHEMA },
        max_tokens: 500,
        temperature: 0.2
      }));
      console.log('Fallback schema analysis successful');
    }

    const content = resp.choices?.[0]?.message?.content || "{}";
    
    // Validate the response is valid JSON
    try {
      JSON.parse(content);
    } catch (jsonError) {
      console.error('Invalid JSON response:', content);
      throw new Error(`Invalid JSON response from AI: ${jsonError.message}`);
    }
    
    return { 
      statusCode: 200, 
      headers: { "Content-Type":"application/json", ...CORS }, 
      body: content 
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
