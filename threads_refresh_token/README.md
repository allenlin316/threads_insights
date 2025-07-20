# Threads API Token Refresh Cloud Function

這個專案的 `main.py` 是一個 Google Cloud Function，
用來刷新 Threads API 的 access token，並自動將新的 token 寫回 Google Secret Manager。

## 主要功能
- 取得現有 access token（從 Secret Manager）
- 調用 Threads API 取得新 access token
- 將新 access token 寫回 Secret Manager（自動成為 latest 版本）
- 回傳 JSON 結果，支援 CORS

## 快速部署
1. 確保已在 Google Cloud 專案啟用 Cloud Functions 與 Secret Manager。
2. 在 Secret Manager 建立名為 `threads-access-token` 的 secret，內容為你的 long-lived access token。
3. 部署 Cloud Function：

```bash
gcloud functions deploy refresh-threads-token \
    --gen2 \
    --runtime=python311 \
    --region=asia-east1 \
    --source=. \
    --entry-point=refresh_threads_token \
    --trigger=http \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID"
```

## 使用方式
- 直接以 HTTP GET/POST 請求呼叫 Cloud Function endpoint。
- 成功時會回傳新 token 及相關資訊，失敗時回傳錯誤訊息。

## 備註
- 其他程式只要用 `versions/latest` 取得 secret，就會拿到最新的 access token。
- 每次刷新都會自動建立新版本，無需手動管理。 