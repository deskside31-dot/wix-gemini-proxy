// netlify/functions/gemini.js
// 正しい修正版: v1betaエンドポイントを継続使用（これが正しい）

exports.handler = async (event, context) => {
  console.log('🚀 Gemini API function called');
  
  // CORS設定（Wix対応）
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONSリクエスト（プリフライト）への対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // POSTメソッドのみ許可
  if (event.httpMethod !== 'POST') {
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
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'メッセージが入力されていません'
        })
      };
    }

    if (userMessage.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'メッセージが長すぎます（最大2000文字）'
        })
      };
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY environment variable not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'サーバー設定エラー: APIキーが設定されていません'
        })
      };
    }

    console.log('📤 Calling Gemini API with message length:', userMessage.length);
    
    // ✅ 正しいエンドポイント: v1betaを使用（これが正しい形式）
    // ただし、モデル名を修正: gemini-1.5-flash-002 → gemini-1.5-flash
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    console.log('🌐 Using endpoint:', GEMINI_ENDPOINT.replace(GEMINI_API_KEY, '[REDACTED]'));
    
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
          maxOutputTokens: 1000,
          temperature: 0.7
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
      
      let errorMessage = 'Gemini APIエラーが発生しました';
      
      if (geminiResponse.status === 400) {
        errorMessage = 'リクエスト形式が無効です';
      } else if (geminiResponse.status === 401) {
        errorMessage = 'APIキーが無効です';
      } else if (geminiResponse.status === 403) {
        errorMessage = 'APIキーに権限がないか、クォータ制限に達している可能性があります';
      } else if (geminiResponse.status === 404) {
        errorMessage = 'Gemini APIモデルまたはプロジェクトが見つかりません';
      } else if (geminiResponse.status === 429) {
        errorMessage = 'レート制限に達しました。しばらく待ってから再試行してください';
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
    console.log('✅ Gemini API response received successfully');

    if (!data.candidates || data.candidates.length === 0) {
      console.error('❌ No candidates in response:', data);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'レスポンスが生成されませんでした - コンテンツがブロックされた可能性があります'
        })
      };
    }

    const candidate = data.candidates[0];
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: '生成されたコンテンツが空またはブロックされました'
        })
      };
    }

    const generatedText = candidate.content.parts[0].text;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        response: generatedText,
        text: generatedText,
        timestamp: new Date().toISOString(),
        finishReason: candidate.finishReason || 'STOP'
      })
    };

  } catch (error) {
    console.error('💥 Function error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'サーバー内部エラー',
        debug: error.message
      })
    };
  }
};
