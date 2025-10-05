// netlify/functions/gemini.js
import fetch from "node-fetch";

export const handler = async (event) => {
  const ALLOWED_ORIGIN = "https://deskside31.wixsite.com";

  // ✅ Preflight (CORS)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "OK",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
      body: JSON.stringify({ success: false, error: "Method Not Allowed" }),
    };
  }

  try {
    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
        body: JSON.stringify({ success: false, error: "Missing message" }),
      };
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=" +
      GEMINI_API_KEY;

    // ✅ Node.js ResponseStreamをそのまま転送
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const text = await geminiResponse.text();
      throw new Error(`Gemini API error ${geminiResponse.status}: ${text}`);
    }

    // ✅ ストリームをそのまま返す
    return new Response(geminiResponse.body, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("💥 Streaming error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
