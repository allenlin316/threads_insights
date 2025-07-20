# Google APIs 設定指南

## 問題診斷

根據錯誤訊息 "建立 Google Sheets 失敗: GaxiosError: The caller does not have permission"，這表示服務帳戶缺少必要的權限。

## 解決步驟

### 1. 啟用必要的 Google APIs

在 Google Cloud Console 中啟用以下 API：

1. **Google Sheets API**
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)
   - 選擇你的專案
   - 前往 "API 和服務" > "程式庫"
   - 搜尋並啟用 "Google Sheets API"

2. **Google Drive API**
   - 在同樣的程式庫頁面
   - 搜尋並啟用 "Google Drive API"

### 2. 建立服務帳戶

1. 前往 "IAM 與管理" > "服務帳戶"
2. 點擊 "建立服務帳戶"
3. 輸入服務帳戶名稱（例如：`threads-insights-sa`）
4. 點擊 "建立並繼續"

### 3. 設定服務帳戶權限

為服務帳戶添加以下 IAM 角色：

1. **Secret Manager Secret Accessor**
   - 允許存取 Secret Manager 中的密鑰

2. **Google Drive API 權限**
   - 在服務帳戶詳情頁面，點擊 "權限" 標籤
   - 點擊 "授予存取權"
   - 添加以下角色：
     - `Editor` 或 `Owner`（用於建立和編輯檔案）

### 4. 建立服務帳戶金鑰

1. 在服務帳戶詳情頁面，點擊 "金鑰" 標籤
2. 點擊 "新增金鑰" > "建立新金鑰"
3. 選擇 "JSON" 格式
4. 下載金鑰檔案

### 5. 將金鑰儲存到 Secret Manager

1. 前往 "安全性" > "Secret Manager"
2. 點擊 "建立密鑰"
3. 密鑰 ID：`google-sheets-key`
4. 密鑰值：貼上整個 JSON 金鑰內容
5. 點擊 "建立密鑰版本"

### 6. 設定環境變數

確保以下環境變數已正確設定：

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
SPREADSHEET_ID=your-spreadsheet-id  # 可選
DRIVE_FOLDER_ID=your-folder-id      # 可選
DRIVE_FOLDER_NAME=your-folder-name  # 可選
```

### 7. 測試權限

執行診斷腳本來檢查權限設定：

```bash
node diagnose_permissions.js
```

## 常見問題

### Q: 為什麼會出現 "The caller does not have permission" 錯誤？

A: 這通常表示：
- 服務帳戶沒有 Google Sheets API 或 Google Drive API 的權限
- 相關 API 未啟用
- 服務帳戶金鑰格式不正確

### Q: 如何檢查服務帳戶權限？

A: 使用診斷腳本：
```bash
node diagnose_permissions.js
```

### Q: 服務帳戶需要哪些具體權限？

A: 服務帳戶需要：
- 建立 Google Sheets 檔案的權限
- 在 Google Drive 中建立和編輯檔案的權限
- 存取 Secret Manager 的權限

### Q: 如何驗證設定是否正確？

A: 診斷腳本會：
1. 檢查環境變數
2. 驗證模組安裝
3. 測試 Secret Manager 存取
4. 測試 Google APIs 認證
5. 測試 Drive API 和 Sheets API 權限

## 故障排除

如果仍然遇到問題：

1. **檢查 API 啟用狀態**
   - 確認 Google Sheets API 和 Google Drive API 已啟用

2. **檢查服務帳戶權限**
   - 確認服務帳戶有適當的 IAM 角色

3. **檢查金鑰格式**
   - 確認 Secret Manager 中的金鑰是完整的 JSON 格式

4. **檢查環境變數**
   - 確認 `GOOGLE_CLOUD_PROJECT` 已正確設定

5. **查看詳細錯誤訊息**
   - 執行診斷腳本獲取詳細資訊 