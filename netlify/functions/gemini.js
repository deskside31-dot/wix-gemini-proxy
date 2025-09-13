// netlify/functions/gemini.js
// Wix対応の統一されたGemini API Function

exports.handler = async (event, context) => {
  console.log('Gemini API function called');
  
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
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        })
      };
    }

    // messageフィールド（Wix用）とpromptフィールド（従来用）の両方に対応
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

    // メッセージの長さ制限
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

    // 環境変数からAPIキーを取得
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'サーバー設定エラー'
        })
      };
    }

    console.log('Calling Gemini API with message length:', userMessage.length);
    
    // fetch関数は現在のNode.jsで標準で利用可能（Node.js 18+）
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
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
      }
    );

    console.log('Gemini API response status:', geminiResponse.status);
    
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      
      let errorMessage = `Gemini API error: ${geminiResponse.status}`;
      
      if (geminiResponse.status === 400) {
        errorMessage = 'リクエスト形式が無効です';
      } else if (geminiResponse.status === 403) {
        errorMessage = 'APIキーが無効または権限不足です';
      } else if (geminiResponse.status === 404) {
        errorMessage = 'APIエンドポイントが見つかりません';
      } else if (geminiResponse.status === 429) {
        errorMessage = 'レート制限に達しました。しばらく待ってから再試行してください';
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          details: errorText
        })
      };
    }

    const data = await geminiResponse.json();
    console.log('Gemini API response received successfully');

    // レスポンス構造の確認
    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in response:', data);
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
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('Content was blocked or truncated:', candidate.finishReason);
    }

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

    // Wix用のレスポンス形式（responseフィールド）と従来形式（textフィールド）の両方に対応
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        response: generatedText,  // Wix用
        text: generatedText,      // 従来用
        timestamp: new Date().toISOString(),
        finishReason: candidate.finishReason || 'STOP'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    
    let errorMessage = 'サーバー内部エラー';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      errorMessage = 'ネットワーク接続エラー';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Gemini APIへの接続に失敗しました';
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
