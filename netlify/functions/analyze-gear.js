// /.netlify/functions/analyze-gear
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          slot: { type: "string" },
          rarity: { type: "string" },
          type: { type: "string" },
          affixes: {
            type: "array",
            items: {
              type: "object", 
              additionalProperties: false,
              properties: { 
                stat: { type: "string" }, 
                val: { type: ["string","number","null"] } 
              },
              required: ["stat"]
            }
          },
          aspects: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["Blue","Green","Yellow","Red"] },
          score: { type: "number" },
          reasons: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } }
        },
        required: ["name","slot","status","reasons"]
      },
      strict: true
    };

    const messages = [
      { 
        role: "system",
        content: "You are a Diablo 4 gear analyst for a Hydra Sorcerer. Use only the supplied RULES. Return STRICT JSON." 
      },
      { 
        role: "user", 
        content: [
          { 
            type: "text", 
            text: "Analyze this item screenshot. Grade (Blue/Green/Yellow/Red) using RULES. Prefer Icy Veins; include improvements to reach Blue." 
          },
          { 
            type: "image_url", 
            image_url: image 
          },
          { 
            type: "text", 
            text: `SLOT: ${slot || "unknown"}` 
          },
          { 
            type: "text", 
            text: `RULES JSON:\n${JSON.stringify(rules || {})}` 
          }
        ]
      }
    ];

    const resp = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_schema", json_schema: schema }
    });

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
