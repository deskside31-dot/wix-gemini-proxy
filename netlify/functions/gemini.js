// netlify/functions/gemini.js
import fetch from "node-fetch";

export const handler = async (event) => {
  const ALLOWED_ORIGIN = "https://deskside31.wixsite.com";

  // ✅ Preflight (CORS) 対応
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

  // ✅ POST以外は拒否
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ success: false, error: "Method Not Allowed" }),
    };
  }

  try {
    // ✅ リクエストデータ解析
    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
        body: JSON.stringify({ success: false, error: "Missing message" }),
      };
    }

    // ✅ Gemini APIエンドポイント
    const GEMINI_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      process.env.GEMINI_API_KEY;

    // ✅ タイムアウト付きFetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60秒
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: message }] }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // ✅ APIレスポンス解析
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();

    // Geminiの応答テキスト抽出
    const geminiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "回答が見つかりませんでした。";

    // ✅ 正常応答
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        response: geminiText,
      }),
    };
  } catch (error) {
    console.error("Gemini Function Error:", error);

    // ✅ エラー応答
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: error.name === "AbortError" ? "タイムアウトしました。" : error.message,
      }),
    };
  }
};
