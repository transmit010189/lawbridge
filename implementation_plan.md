# 法規爬蟲 + RAG Pipeline + Firebase 部署

依據 `程式規劃` 中的架構規劃，建立台灣法規爬蟲系統、RAG 知識庫，並推送至 Firebase Firestore 供 LawBridge 直接使用。

## User Review Required

> [!IMPORTANT]
> 本方案會將法規資料寫入 Firebase Firestore（`kb_sources` + `kb_chunks` collections），並使用 Gemini Embedding API 生成向量。請確認：
> 1. [.env.local](file:///D:/AMAN/lawbridge/.env.local) 中的 `GEMINI_API_KEY` 是否有效且有足夠額度（約需 600+ embedding requests）
> 2. Firebase 專案 `lawbridge-tw` 的 Firestore 是否已啟用
> 3. 是否需要設定 `FIREBASE_SERVICE_ACCOUNT_KEY` 才能從本地寫入 Firestore（目前為空）

> [!WARNING]
> 如果沒有 Firebase Admin SDK 的 Service Account Key，爬蟲腳本將無法從本地寫入 Firestore。您需要從 Firebase Console > Project Settings > Service Accounts 下載 JSON 金鑰，並將其內容貼到 [.env.local](file:///D:/AMAN/lawbridge/.env.local) 的 `FIREBASE_SERVICE_ACCOUNT_KEY` 欄位中。

## Proposed Changes

### Scripts: 法規爬蟲與 RAG Pipeline

在 `lawbridge/scripts/` 目錄下建立獨立的 Node.js/TypeScript 腳本，可透過 `npx tsx` 直接執行。

---

#### [NEW] [crawl-laws.ts](file:///D:/AMAN/lawbridge/scripts/crawl-laws.ts)

法規爬蟲腳本，從「全國法規資料庫」（law.moj.gov.tw）抓取以下 6 部法規全文：

| 法規名稱 | PCode |
|---------|-------|
| 勞動基準法 | N0030001 |
| 就業服務法 | N0090001 |
| 外國人從事就業服務法第四十六條第一項第八款至第十一款工作資格及審查標準 | N0090006 |
| 勞工退休金條例 | N0030020 |
| 職業安全衛生法 | N0060001 |
| 性別平等工作法 | N0030014 |

**策略**: 使用 `fetch` 抓取 `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=XXXX`，解析 HTML 提取：
- 法規名稱、修正日期
- 各章節標題
- 各條文編號與內容

**輸出**: JSON 檔案存至 `lawbridge/data/laws/` 目錄

---

#### [NEW] [chunk-laws.ts](file:///D:/AMAN/lawbridge/scripts/chunk-laws.ts)

法規切塊腳本，按照規劃文件的 chunking 規則：
- **一條一塊**為主
- 每塊保留 `articleNo`, `sectionPath`, `effectiveDate`, `jurisdiction` metadata
- 控制在 300-900 tokens
- 很短的條文帶上章節標題作為 context

**輸出**: 切塊後的 JSON 檔案存至 `lawbridge/data/chunks/`

---

#### [NEW] [embed-and-upload.ts](file:///D:/AMAN/lawbridge/scripts/embed-and-upload.ts)

Embedding + Firestore 上傳腳本：
1. 讀取切塊後的法規 JSON
2. 呼叫 Gemini Embedding API (`gemini-embedding-001`)，使用 `RETRIEVAL_DOCUMENT` task type
3. 設定 `outputDimensionality = 768`（Firestore vector search 限制 2048 維，使用 768 在降低成本同時保持品質）
4. Normalize 向量（非 3072 維需自行 normalize）
5. 寫入 Firestore：
   - `kb_sources/{sourceId}` — 法規來源文件記錄
   - `kb_chunks/{chunkId}` — 包含 `text`, `embedding`, metadata

---

#### [NEW] [run-pipeline.ts](file:///D:/AMAN/lawbridge/scripts/run-pipeline.ts)

一鍵執行完整 pipeline 的入口腳本：
1. 執行爬蟲 → 2. 執行切塊 → 3. 執行 embedding + 上傳

---

### Lawbridge 應用整合

---

#### [MODIFY] [firestore.rules](file:///D:/AMAN/lawbridge/firestore.rules)

新增 `kb_sources` 和 `kb_chunks` 的安全規則：
- **所有認證使用者可讀取**（用於 RAG 查詢）
- **僅 server-side 可寫入**（透過 Admin SDK）

---

#### [MODIFY] [firestore.indexes.json](file:///D:/AMAN/lawbridge/firestore.indexes.json)

新增索引：
- `kb_chunks`: `sourceType + language + isActive` 組合索引
- `kb_sources`: `sourceType + status` 組合索引

> [!NOTE]
> Firestore vector index 需要透過 Firebase Console 或 `gcloud` CLI 手動建立，無法透過 `firestore.indexes.json` 定義。Pipeline 腳本完成後會輸出建立 vector index 的指令。

---

#### [NEW] [rag/route.ts](file:///D:/AMAN/lawbridge/src/app/api/rag/route.ts)

RAG 查詢 API 端點：
1. 接收使用者問題（POST body）
2. 使用 Gemini Embedding 嵌入查詢（task type: `RETRIEVAL_QUERY`）
3. 執行 Firestore vector search（取 top 10）
4. 將 top 5 chunks 送入 Gemini LLM 生成回答
5. 回傳答案 + 引用法條

---

### 資料目錄

#### [NEW] data/laws/ (directory)
爬蟲輸出的原始法規 JSON

#### [NEW] data/chunks/ (directory)
切塊後的法規 JSON

---

### 相依套件

需安裝：
- `cheerio` — HTML 解析（爬蟲用）
- `dotenv` — 讀取環境變數

## Verification Plan

### Automated Tests

1. **爬蟲驗證**：執行 `npx tsx scripts/crawl-laws.ts`
   - 檢查 `data/laws/` 下是否產生 6 個 JSON 檔
   - 檢查每個 JSON 是否包含完整條文（條號 + 內容）
   - 執行指令：`npx tsx scripts/crawl-laws.ts && dir data\laws\`

2. **切塊驗證**：執行 `npx tsx scripts/chunk-laws.ts`
   - 檢查 `data/chunks/` 下是否產生對應的切塊 JSON
   - 檢查每個 chunk 是否包含 `articleNo`, `sectionPath`, `text` 等欄位
   - 執行指令：`npx tsx scripts/chunk-laws.ts && dir data\chunks\`

3. **Embedding + 上傳驗證**：執行 `npx tsx scripts/embed-and-upload.ts`
   - 檢查 Firestore 中 `kb_sources` 和 `kb_chunks` 是否寫入成功
   - 腳本自帶計數器輸出寫入數量

4. **Firebase 部署驗證**：執行 `firebase deploy --only firestore`
   - 檢查 rules 和 indexes 是否成功部署

### Manual Verification

1. 上傳完成後，請至 Firebase Console > Firestore Database 確認：
   - `kb_sources` collection 有 6 筆文件
   - `kb_chunks` collection 有數百筆文件，每筆都包含 `embedding` 欄位
2. RAG 查詢：啟動 `npm run dev`，使用 curl 或瀏覽器測試 `/api/rag` 端點

---

# Phase 2: Feature Enhancements & Bug Fixes

本階段將解決部署版本的登入問題、建立律師專屬的工作臺（包含證照上傳與手機 QR Code 掃描）、為 RAG 問答增添語音功能，以及爬取並匯入勞動力發展署（WDA）的中階技術人力計畫問答資料。

## Proposed Changes

### 1. 登入功能修復 (Login Fixes)
**問題診斷**：部署版本登入或註冊失敗，通常肇因於兩點：
1. **Firestore 權限阻擋**：`useAuth.ts` 中，新使用者註冊時會寫入 `users/{uid}` 與 `wallets/{uid}`。必須確認 `firestore.rules` 允許 `request.auth.uid == uid` 進行建立與寫入。
2. **Authorized Domains**：Google 登入在自訂網域或 `*.hosted.app` 上可能會失敗，需要在 Firebase Console > Authentication > Settings > Authorized domains 中，手動加入 `lawbridge-web--lawbridge-tw.asia-east1.hosted.app`。
- **改動檔案**：
  - `[MODIFY] firestore.rules`: 修正 `users` 與 `wallets` 的 write 規則。
  - `[MODIFY] src/hooks/useAuth.ts`: 新增登入失敗的 console.error 方便 debug，並優化錯誤處理。

### 2. 語音問答功能 (Voice UI for RAG)
針對移工可能不方便打字的情境，添加語音輸入（Speech-to-Text）與朗讀（Text-to-Speech）功能。
- **改動檔案**：
  - `[MODIFY] src/components/ai/LegalAssistant.tsx` (或對應的對話 UI 元件):
    - 引入瀏覽器原生的 `Web Speech API` (`webkitSpeechRecognition` 與 `speechSynthesis`)。
    - 在輸入框旁增加「麥克風」圖示按鈕，按住或點擊開始錄音，轉換為文字。
    - 每當 AI 生成回答後，提供一個「喇叭」按鈕可以朗讀答案內容。

### 3. 律師專屬介面與資料上傳 (Lawyer Dashboard & Upload)
律師登入後應該要進入獨立的 Workspace，可以上傳執業證明檔案，並提供 QR Code 掃描。
- **改動檔案**：
  - `[NEW] src/app/[locale]/lawyer-dashboard/page.tsx`: 律師專屬工作檯入口。
  - `[NEW] src/components/lawyer/CertificateUpload.tsx`: 串接 Firebase Storage，允許上傳證明文件。
  - `[NEW] src/components/lawyer/QRCodeScanner.tsx`: 使用 `html5-qrcode` 套件，實作手機相機讀取 QR Code 功能。
  - `[MODIFY] firebase.json` 和 `storage.rules` (若有必要): 確保 Firebase Storage 規則允許認證使用者上傳檔案到 `certificates/{uid}/`。

### 4. 擴充 RAG 知識庫 (WDA 中階技術人力計畫)
針對移工與雇主關心的中階技術人力計畫，從勞發署擷取問答集並嵌入。
- **改動檔案**：
  - `[NEW] scripts/crawl-wda-faq.ts`: 爬取 `fw.wda.gov.tw` 該目標網頁中的問答內容與 PDF 連結。
  - `[MODFIY] scripts/chunk-laws.ts` (或建立新的 chunk 腳本): 將 FAQ 單元轉換為 Chunk。
  - `[MODFIY] scripts/embed-and-upload.ts`: 將產生的 chunk 執行 embedding 後推上 Firestore 的 `kb_chunks`。

## Verification Plan (Phase 2)
1. Firebase Console 加入 Authorized Domain。
2. 使用本機測試信箱與 Google 登入功能，確認 Firestore 使用者與錢包成功建立。
3. 測試語音麥克風能否辨識中文/英文，播放答覆是否正常。
4. 在律師 Dashboard 測試上傳單一圖片，並取得 Firebase Storage URL。
5. 手機掃描 QR Code 元件正確讀取字串。
6. 驗證 `/api/rag` 是否能回答有關「中階技術人力」的問題。
