// Netlify Function: /.netlify/functions/analyze-gear
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const SCHEMA = {
  name: "GearReport",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      slot: { type: "string" },
      rarity: { type: "string", enum: ["Legendary","Unique","Mythic","Unknown"] },
      type: { type: "string" },
      item_power: { type: ["number","null"] },
      armor: { type: ["number","null"] },
      aspect: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: ["string","null"] },
          source: { type: "string", enum: ["imprinted","unique_base","unknown"] },
          text: { type: "string" }
        },
        required: ["name","source","text"]
      },
      affixes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            stat: { type: "string" },
            val: { type: ["number","null"] },
            unit: { type: ["string","null"] },
            greater: { type: ["boolean","null"] },
            tempered: { type: ["boolean","null"] }
          },
          required: ["stat","val","unit","greater","tempered"]
        }
      },
      masterwork: {
        type: "object",
        additionalProperties: false,
        properties: { rank:{type:["number","null"]}, max:{type:["number","null"]} },
        required: ["rank","max"]
      },
      tempers: {
        type: "object",
        additionalProperties: false,
        properties: { used:{type:["number","null"]}, max:{type:["number","null"]} },
        required: ["used","max"]
      },
      sockets: { type: ["number","null"] },
      gems: { type: "array", items: { type:"string" } },
      status: { type: "string", enum: ["Blue","Green","Yellow","Red"] },
      score: { type: ["number","null"] },
      reasons: { type: "array", items: { type:"string" } },
      improvements: { type: "array", items: { type:"string" } },
      confidence: { type: ["number","null"] }
    },
    required: ["name","slot","rarity","type","item_power","armor","aspect","affixes","masterwork","tempers","sockets","gems","status","score","reasons","improvements","confidence"]
  }
};

const PROMPT_SYSTEM = `
You are a Diablo 4 gear analyst for a Hydra Sorcerer.
Read ONE item screenshot and return STRICT JSON that matches the schema. No prose.
Use color cues (gold=Unique, orange=Legendary; blue numbers = Greater affix).
Differentiate imprinted aspects vs unique base powers.
Normalize affix names, parse numeric values to numbers, include unit, mark greater/tempered when visible.
Grade using only the supplied RULES for the slot. Prefer Icy Veins over Maxroll when conflicting.
Provide reasons and concrete improvements to reach Blue.
`;

function buildMessages({ image, slot, rules }) {
  const slotKey = (slot || '').toString().trim().toLowerCase();
  const rulesForSlot = rules?.slots?.[slotKey] || {};
  return [
    { role: "system", content: PROMPT_SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text:
          "Analyze this item. Use the RULES JSON to grade (Blue/Green/Yellow/Red). " +
          "Normalize fields; include reasons and improvements to reach Blue. JSON only." },
        { type: "image_url", image_url: { url: image } },
        { type: "text", text: `Slot hint: ${slot || "unknown"}` },
        { type: "text", text: `RULES JSON:\n${JSON.stringify(rulesForSlot || {})}` }
      ]
    }
  ];
}

async function withRetry(fn, tries=3) {
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

function normalizeReport(r = {}) {
  const def = v => (v === undefined ? null : v);
  const out = {
    name: def(r.name) || 'Unknown Item',
    slot: (r.slot || 'unknown').toLowerCase(),
    rarity: r.rarity || 'Unknown',
    type: r.type || '',
    item_power: def(r.item_power),
    armor: def(r.armor),
    aspect: { name: r.aspect?.name ?? null, source: r.aspect?.source || 'unknown', text: r.aspect?.text || '' },
    affixes: Array.isArray(r.affixes) ? r.affixes.map(a => ({
      stat: a?.stat || '', val: (typeof a?.val === 'number') ? a.val : null,
      unit: a?.unit ?? null, greater: !!a?.greater, tempered: !!a?.tempered
    })) : [],
    masterwork: { rank: r.masterwork?.rank ?? null, max: r.masterwork?.max ?? null },
    tempers: { used: r.tempers?.used ?? null, max: r.tempers?.max ?? null },
    sockets: r.sockets ?? null,
    gems: Array.isArray(r.gems) ? r.gems : [],
    status: r.status || 'Yellow',
    score: (typeof r.score === 'number') ? r.score : null,
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
    improvements: Array.isArray(r.improvements) ? r.improvements : [],
    confidence: (typeof r.confidence === 'number') ? r.confidence : null,
    _fallback: true
  };
  return out;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  try {
    const { image, slot, rules } = JSON.parse(event.body || "{}");
    if (!image) throw new Error("Missing 'image' (dataURL).");
    const messages = buildMessages({ image, slot, rules });

    let content; let strictError = null;
    try {
      const resp = await withRetry(() => client.chat.completions.create({
        model: MODEL, messages,
        response_format: { type: "json_schema", json_schema: SCHEMA },
        max_tokens: 500, temperature: 0.2
      }));
      content = resp.choices?.[0]?.message?.content || "{}";
    } catch (e) {
      strictError = e;
      const fb = await withRetry(() => client.chat.completions.create({
        model: MODEL, messages,
        response_format: { type: "json_object" },
        max_tokens: 600, temperature: 0.2
      }));
      content = fb.choices?.[0]?.message?.content || "{}";
    }

    let json; try { json = JSON.parse(content); } catch { json = {}; }
    if (strictError || !json || !json.name || !Array.isArray(json.affixes)) {
      json = normalizeReport(json);
      json._note = 'Normalized from fallback';
    }

    return { statusCode: 200, headers: { "Content-Type":"application/json", ...CORS }, body: JSON.stringify(json) };
  } catch (err) {
    const status = err.status || err?.response?.status || 400;
    return { statusCode: status, headers: { "Content-Type":"application/json", ...CORS }, body: JSON.stringify({ error: String(err), status }) };
  }
};
