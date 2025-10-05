// netlify/functions/gemini.js
// CORS完全対応版

exports.handler = async (event, context) => {
  console.log('🚀 Gemini Function called');
  console.log('📍 Origin:', event.headers.origin);
  console.log('🔧 Method:', event.httpMethod);
  
  // CORS設定（完全版）
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };

  // OPTIONSリクエスト（プリフライト）への対応
  if (event.httpMethod === 'OPTIONS') {
    console.log('✅ OPTIONS request - returning CORS headers');
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // POSTメソッドのみ許可
  if (event.httpMethod !== 'POST') {
    console.log('❌ Method not allowed:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Method not allowed. Use POST.' 
      })
    };
  }

  try {
    // リクエストボディの解析
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
      console.log('📦 Request body parsed, message length:', requestBody.message?.length || 0);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        })
      };
    }

    const userMessage = requestBody.message || requestBody.prompt;
    
    if (!userMessage || typeof userMessage !== 'string') {
      console.log('❌ No message provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'メッセージが入力されていません'
        })
      };
    }

    if (userMessage.length > 5000) {
      console.log('❌ Message too long:', userMessage.length);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'メッセージが長すぎます（最大5000文字）'
        })
      };
    }

    // 環境変数からAPIキーを取得
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'サーバー設定エラー'
        })
      };
    }

    console.log('📤 Calling Gemini API...');
    
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: userMessage
          }]
        }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.8,
          topK: 40
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      })
    });

    console.log('📨 Gemini API response status:', geminiResponse.status);
    
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ Gemini API error:', geminiResponse.status, errorText);
      
      let errorMessage = 'Gemini APIエラー';
      
      if (geminiResponse.status === 400) {
        errorMessage = 'リクエスト形式が無効です';
      } else if (geminiResponse.status === 401 || geminiResponse.status === 403) {
        errorMessage = 'APIキーが無効または権限不足です';
      } else if (geminiResponse.status === 404) {
        errorMessage = 'Gemini 2.5 Flashモデルにアクセスできません';
      } else if (geminiResponse.status === 429) {
        errorMessage = 'レート制限に達しました';
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          details: errorText,
          httpStatus: geminiResponse.status
        })
      };
    }

    const data = await geminiResponse.json();
    console.log('✅ Gemini response received');

    if (!data.candidates || data.candidates.length === 0) {
      console.error('❌ No candidates in response');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'レスポンスが生成されませんでした'
        })
      };
    }

    const candidate = data.candidates[0];
    
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('⚠️ Content filtered:', candidate.finishReason);
    }
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error('❌ Empty content');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: '生成されたコンテンツが空です',
          finishReason: candidate.finishReason
        })
      };
    }

    const generatedText = candidate.content.parts[0].text;
    console.log('📋 Response length:', generatedText.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        response: generatedText,
        text: generatedText,
        model: 'gemini-2.5-flash',
        timestamp: new Date().toISOString(),
        finishReason: candidate.finishReason || 'STOP'
      })
    };

  } catch (error) {
    console.error('💥 Function error:', error);
    
    let errorMessage = 'サーバー内部エラー';
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      errorMessage = 'ネットワーク接続エラー';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Gemini APIへの接続に失敗';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        debug: error.message
      })
    };
  }
};
