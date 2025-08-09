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
          name: { type: "string", description: "Exact item name as shown in the image" },
          slot: { type: "string", description: "Detected gear slot (helm, amulet, chest, gloves, pants, boots, ring, weapon, offhand)" },
          rarity: { type: "string", description: "Item rarity (Common, Magic, Rare, Legendary, Unique)" },
          type: { type: "string", description: "Item type (e.g., 'Helm', 'Ring', 'Staff', 'Focus')" },
          itemLevel: { type: ["string", "number"], description: "Item level if visible" },
          affixes: {
            type: "array",
            description: "ALL visible affixes with exact values",
            items: {
              type: "object",
              properties: { 
                stat: { type: "string", description: "Exact stat name as shown" }, 
                val: { type: ["string","number","null"], description: "Exact value as shown (including ranges like '10-15%')" },
                type: { type: "string", enum: ["prefix", "suffix", "implicit"], description: "Affix type if discernible" }
              },
              required: ["stat", "val"]
            }
          },
          aspects: { 
            type: "array", 
            description: "ALL visible aspects with full descriptions",
            items: { 
              type: "object",
              properties: {
                name: { type: "string", description: "Aspect name (e.g., 'Serpentine Aspect')" },
                description: { type: "string", description: "Full aspect text as shown on item" },
                type: { type: "string", enum: ["imprinted", "natural"], description: "Whether aspect was imprinted or is natural" }
              },
              required: ["name", "description"]
            }
          },
          status: { type: "string", enum: ["Blue","Green","Yellow","Red"], description: "Quality assessment" },
          score: { type: "number", description: "Numerical score 0-100" },
          reasons: { type: "array", items: { type: "string" }, description: "Detailed reasoning for score" },
          improvements: { type: "array", items: { type: "string" }, description: "Specific improvement suggestions" },
          notes: { type: "string", description: "Any additional observations about the item" }
        },
        required: ["name","slot","status","reasons","affixes","aspects"]
      }
    };

    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const messages = [
      {
        role: "system",
        content:
          "You are a Diablo 4 gear analyst specializing in Hydra Sorcerer builds. Your job is to provide COMPLETE and ACCURATE analysis of gear items.\n\n" +
          "CRITICAL REQUIREMENTS:\n" +
          "1. ONLY report what you can ACTUALLY SEE in the image. Do NOT guess, assume, or make up information.\n" +
          "2. If you cannot clearly read an affix, aspect, or stat, do NOT include it.\n" +
          "3. Capture EVERY visible detail - missing information can lead to incorrect comparisons.\n" +
          "4. Be extremely precise with values, ranges, and percentages.\n\n" +
          "AFFIX ANALYSIS:\n" +
          "- Extract ALL visible affixes with their EXACT values\n" +
          "- Include ranges (e.g., '10-15%') exactly as shown\n" +
          "- Distinguish between prefixes, suffixes, and implicits if possible\n" +
          "- Do not skip any affix, even if it seems minor\n\n" +
          "ASPECT DETECTION:\n" +
          "- Look for TWO types of aspects:\n" +
          "  1) IMPRINTED aspects (shown after 'Imprinted' text) - manually added\n" +
          "  2) NATURAL aspects (shown with orange star ★ and orange text) - came with item\n" +
          "- Aspects use predominantly ORANGE text with some WHITE words\n" +
          "- Extract the ASPECT NAME and include the FULL TEXT description\n" +
          "- Example: {name: 'Serpentine Aspect', description: 'Hydras deal 0.5-1.5% increased damage per Mana when summoned', type: 'imprinted'}\n" +
          "- Include ALL aspects you can see, whether imprinted or natural\n\n" +
          "ITEM IDENTIFICATION:\n" +
          "- Automatically detect gear slot type from the image\n" +
          "- For rings, use slot 'ring' (not ring1/ring2)\n" +
          "- Include item level if visible\n" +
          "- Note item rarity and type\n\n" +
          "QUALITY ASSESSMENT:\n" +
          "- Reference Icy Veins and Maxroll guides for Hydra Sorcerer recommendations\n" +
          "- Consider mandatory affixes, preferred affixes, and aspects for the slot\n" +
          "- Provide detailed reasoning for your score\n" +
          "- Suggest specific improvements\n\n" +
          "Return STRICT JSON following the schema exactly. No markdown formatting."
      },
      {
        role: "user",
        content: [
          { type: "text", text:
            "Analyze this Diablo 4 item screenshot with EXTREME attention to detail.\n\n" +
            "REQUIREMENTS:\n" +
            "1. Capture EVERY visible affix with exact values\n" +
            "2. Identify ALL aspects (imprinted and natural) with full descriptions\n" +
            "3. Detect the gear slot automatically\n" +
            "4. Include item level, rarity, and type if visible\n" +
            "5. Provide detailed scoring and reasoning\n\n" +
            "Use the RULES JSON to evaluate for Hydra Sorcerer build.\n" +
            "Reference Icy Veins and Maxroll guides for accurate recommendations.\n" +
            "Be thorough - missing details can lead to incorrect gear comparisons." },
          { type: "image_url", image_url: { url: image } },
          { type: "text", text: `RULES JSON:\n${JSON.stringify(rules || {})}` }
        ]
      }
    ];

    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages,
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 800, // Increased for more detailed responses
      temperature: 0.05 // Very low temperature for consistent, precise responses
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
