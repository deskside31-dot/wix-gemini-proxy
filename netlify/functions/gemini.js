// netlify/functions/gemini.js
// =====================================================
// Gemini 2.5 Flash ストリーミング対応API（CORS対応版）
// =====================================================
import fetch from "node-fetch";

export const handler = async (event) => {
  const ALLOWED_ORIGIN = "https://deskside31.wixsite.com"; // ← あなたのWixサイトURL

  // ✅ CORS Preflight（OPTIONSリクエスト対応）
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

  // ✅ POSTのみ許可
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
      body: JSON.stringify({ success: false, error: "Method Not Allowed" }),
    };
  }

  try {
    // ✅ リクエスト内容の取得
    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
        body: JSON.stringify({ success: false, error: "Missing message" }),
      };
    }

    // ✅ Gemini APIキー確認
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
        body: JSON.stringify({ success: false, error: "Missing GEMINI_API_KEY" }),
      };
    }

    // ✅ Gemini 2.5 Flash ストリーミングAPI エンドポイント
    const GEMINI_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=" +
      GEMINI_API_KEY;

    // ✅ Gemini API呼び出し（SSEで受信）
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const text = await geminiResponse.text();
      throw new Error(`Gemini API error ${geminiResponse.status}: ${text}`);
    }

    // ✅ ストリームをそのまま返す（SSE転送）
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
    console.error("💥 Gemini Function Error:", error);
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
