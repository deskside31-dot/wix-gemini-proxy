// netlify/functions/gemini.js
// ✅ Gemini 2.5 Flash Function (CORS対応 / Netlify安定版)

export const handler = async (event) => {
  const ALLOWED_ORIGIN = "https://deskside31.wixsite.com";

  // ✅ CORS: Preflight（OPTIONS）対応
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
      headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
      body: JSON.stringify({ success: false, error: "Method Not Allowed" }),
    };
  }

  try {
    // ✅ リクエストボディ解析
    const { message } = JSON.parse(event.body || "{}");
    if (!message || typeof message !== "string" || message.trim() === "") {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
        body: JSON.stringify({ success: false, error: "メッセージが空です。" }),
      };
    }

    // ✅ 環境変数からAPIキー取得
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error("環境変数 GEMINI_API_KEY が設定されていません。");
    }

    // ✅ Gemini 2.5 Flash エンドポイント
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log("🚀 Gemini API 呼び出し開始");
    console.log("💬 入力メッセージ:", message);

    // ✅ タイムアウト付き Fetch（60秒）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.9,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // ✅ エラーハンドリング
    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ Gemini API Error:", response.status, errText);
      throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
    }

    // ✅ レスポンス解析
    const data = await response.json();
    console.log("✅ Gemini API 正常応答");

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Geminiからの返答が取得できませんでした。";

    // ✅ 正常応答返却
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        model: "gemini-2.5-flash",
        response: text,
      }),
    };
  } catch (error) {
    console.error("💥 Gemini Function Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error:
          error.name === "AbortError"
            ? "Gemini API リクエストがタイムアウトしました。"
            : error.message,
      }),
    };
  }
};
