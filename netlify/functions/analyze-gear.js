// /.netlify/functions/analyze-gear
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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

    const schema = {
      name: "GearReport",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          slot: { type: "string" },
          rarity: { type: "string" },
          type: { type: "string" },
          affixes: {
            type: "array",
            items: {
              type: "object",
              properties: { 
                stat: { type: "string" }, 
                val: { type: ["string","number","null"] } 
              }
            }
          },
          aspects: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["Blue","Green","Yellow","Red"] },
          score: { type: "number" },
          reasons: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } }
        },
        required: ["name","slot","status","reasons"]
      }
    };

    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const messages = [
      {
        role: "system",
        content:
          "You are a Diablo 4 gear analyst for a Hydra Sorcerer. " +
          "CRITICAL: Only report what you can actually SEE in the image. Do NOT guess, assume, or make up information. " +
          "If you cannot clearly read an affix, aspect, or stat, do NOT include it. " +
          "For aspects: Only list aspects that are explicitly visible in the image. If no aspect is shown, return empty array. " +
          "For affixes: Only include affixes with their exact values as shown in the image. " +
          "Reference these guides for accurate Hydra Sorcerer recommendations: " +
          "https://www.icy-veins.com/d4/guides/hydra-sorcerer-build/ and " +
          "https://maxroll.gg/d4/build-guides/hydra-sorcerer-guide " +
          "Return STRICT JSON; no markdown. " +
          "Automatically detect gear slot type from the image. For rings, use slot 'ring'."
      },
      {
        role: "user",
        content: [
          { type: "text", text:
            "Analyze this Diablo 4 item screenshot. " +
            "ONLY report what you can clearly see in the image. Do NOT guess or assume. " +
            "If you cannot read something clearly, do NOT include it. " +
            "Use the RULES JSON to judge for Hydra Sorcerer (Blue/Green/Yellow/Red). " +
            "Reference Icy Veins and Maxroll guides for accurate recommendations. " +
            "AUTOMATICALLY detect the gear slot type (helm, amulet, chest, gloves, pants, boots, ring, weapon, offhand). " +
            "For aspects: Only list if explicitly visible in the image. If no aspect shown, return empty array." },
          { type: "image_url", image_url: { url: image } },
          { type: "text", text: `RULES JSON:\n${JSON.stringify(rules || {})}` }
        ]
      }
    ];

    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages,
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 500,
      temperature: 0.1 // Lower temperature for more conservative responses
    }));

    const content = resp.choices?.[0]?.message?.content || "{}";
    return { 
      statusCode: 200, 
      headers: { "Content-Type":"application/json", ...CORS }, 
      body: content 
    };
  } catch (err) {
    return { 
      statusCode: 400, 
      headers: { "Content-Type":"application/json", ...CORS }, 
      body: JSON.stringify({ error: String(err) }) 
    };
  }
};
