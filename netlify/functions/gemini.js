// netlify/functions/gemini.js
// Gemini 2.5 Flash 対応版

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
    
    // ✅ 修正: Gemini 2.5 Flash を使用（最新の高性能モデル）
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    console.log('🌐 Using Gemini 2.5 Flash model');
    
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
          maxOutputTokens: 5000,
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
      
      let errorMessage = 'Gemini APIエラーが発生しました';
      let troubleshootingTip = '';
      
      if (geminiResponse.status === 400) {
        errorMessage = 'リクエスト形式が無効です';
        troubleshootingTip = 'リクエストの形式を確認してください';
      } else if (geminiResponse.status === 401) {
        errorMessage = 'APIキーが無効です';
        troubleshootingTip = 'Google AI StudioでAPIキーを確認してください';
      } else if (geminiResponse.status === 403) {
        errorMessage = 'APIアクセスが拒否されました';
        troubleshootingTip = 'APIキーの権限またはクォータを確認してください';
      } else if (geminiResponse.status === 404) {
        errorMessage = 'Gemini 2.5 Flashモデルにアクセスできません';
        troubleshootingTip = 'モデルが利用可能か、APIキーに適切な権限があるか確認してください';
      } else if (geminiResponse.status === 429) {
        errorMessage = 'レート制限に達しました';
        troubleshootingTip = 'しばらく待ってから再試行してください';
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          troubleshooting: troubleshootingTip,
          details: errorText,
          httpStatus: geminiResponse.status
        })
      };
    }

    const data = await geminiResponse.json();
    console.log('✅ Gemini 2.5 Flash response received successfully');

    if (!data.candidates || data.candidates.length === 0) {
      console.error('❌ No candidates in response:', data);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'レスポンスが生成されませんでした - コンテンツがセーフティフィルターによってブロックされた可能性があります'
        })
      };
    }

    const candidate = data.candidates[0];
    
    // セーフティフィルターやその他の理由でブロックされた場合のチェック
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('⚠️ Content was filtered or truncated:', candidate.finishReason);
      let warningMessage = '';
      
      if (candidate.finishReason === 'SAFETY') {
        warningMessage = ' (セーフティフィルターによってブロックされました)';
      } else if (candidate.finishReason === 'MAX_TOKENS') {
        warningMessage = ' (最大トークン数に達しました)';
      }
      
      console.warn('⚠️ Finish reason:', candidate.finishReason + warningMessage);
    }
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: '生成されたコンテンツが空またはブロックされました',
          finishReason: candidate.finishReason
        })
      };
    }

    const generatedText = candidate.content.parts[0].text;

    console.log('📋 Generated response length:', generatedText.length);

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
    let troubleshootingTip = '';
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      errorMessage = 'ネットワーク接続エラー';
      troubleshootingTip = 'インターネット接続を確認してください';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Gemini APIへの接続に失敗しました';
      troubleshootingTip = 'APIエンドポイントとネットワーク接続を確認してください';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        troubleshooting: troubleshootingTip,
        debug: error.message
      })
    };
  }
};
