# Wix Gemini API Proxy

WixサイトでGemini APIを安全に使用するためのNetlify Functions実装です。

## 機能
- Gemini APIへの安全なプロキシ
- CORS対応
- 基本的なレート制限
- エラーハンドリング

## 使用方法
1. 環境変数 `GEMINI_API_KEY` を設定
2. Wixから `/.netlify/functions/gemini` エンドポイントを呼び出し

## セキュリティ
- APIキーはサーバーサイドで安全に管理
- プロンプト長制限
- ドメイン制限（オプション）
