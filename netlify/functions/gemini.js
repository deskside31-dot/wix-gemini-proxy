const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('Gemini API function called');
  
  // CORSヘッダーの設定
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // プリフライトリクエスト（OPTIONS）の処理
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // POSTリクエストのみ許可
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
      requestBody = JSON.parse(event.body);
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

    const { prompt, domain } = requestBody;
    
    // 基本的なバリデーション
    if (!prompt || typeof prompt !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing or invalid prompt'
        })
      };
    }

    // プロンプトの長さ制限
    if (prompt.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Prompt too long (max 2000 characters)'
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
          error: 'Server configuration error'
        })
      };
    }

    // ✅ 修正: 最新のGemini APIエンドポイントとモデルを使用
    console.log('Calling Gemini API with prompt length:', prompt.length);
    
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
              text: prompt
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
      
      // より詳細なエラーメッセージを提供
      if (geminiResponse.status === 400) {
        errorMessage = 'Invalid request format or parameters';
      } else if (geminiResponse.status === 403) {
        errorMessage = 'API key is invalid or has insufficient permissions';
      } else if (geminiResponse.status === 404) {
        errorMessage = 'API endpoint not found - model may not exist';
      } else if (geminiResponse.status === 429) {
        errorMessage = 'Rate limit exceeded - please wait and try again';
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
          error: 'No response generated - content may have been blocked'
        })
      };
    }

    // 安全性チェック
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
          error: 'Generated content is empty or blocked'
        })
      };
    }

    const generatedText = candidate.content.parts[0].text;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: generatedText,
        timestamp: new Date().toISOString(),
        finishReason: candidate.finishReason || 'STOP'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    
    // ネットワークエラーの詳細判定
    let errorMessage = 'Internal server error';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      errorMessage = 'Network connectivity error';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Failed to connect to Gemini API';
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
