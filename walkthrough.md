# Lawbridge — 台灣法規知識庫 RAG 與新功能實作報告

## Phase 1: 基礎架構與法規知識庫
1. **法規爬蟲與切塊**：精準解析 `law.moj.gov.tw` 之 HTML 結構，將勞基法等 6 大法規（共 380 條）轉換為 RAG Chunk。
2. **向量化與上傳**：使用 `gemini-embedding` API 生成 768 維向量並寫入 Firestore。
3. **Firestore 權限與索引**：部署安全性規則與所需的複合查詢索引。
4. **RAG 檢索端點**：建立 `/api/rag` 提供問答推論。

---

## Phase 2: 新增功能與錯誤修復 (本次更新)

### 1. 登入與註冊修復
- **問題修正**：原先註冊時因為 Firestore `wallets` 的規則預設「完全阻擋寫入」，導致前端在建立新帳戶時被 Firebase 拋出 `Permission Denied`。
- **處理結果**：已更新 [firestore.rules](file:///D:/AMAN/lawbridge/firestore.rules) 並直接部署至生產環境，允許使用者於註冊當下建立自己的錢包文件，解決登入崩潰問題。

### 2. 律師專屬工作檯 (Lawyer Workspace)
- **專屬入口 (`/lawyers`)**：建立完善的身分驗證機制，非律師身分進入將直接被攔截提示。
- **防偽證照上傳 ([CertificateUpload.tsx](file:///D:/AMAN/lawbridge/src/components/lawyer/CertificateUpload.tsx))**：已串接 Firebase Storage (`verifications/{uid}/`) 搭配視覺化的進度條元件，讓律師能順利提交身分審查。
- **手機端掃碼 ([QRCodeScanner.tsx](file:///D:/AMAN/lawbridge/src/components/lawyer/QRCodeScanner.tsx))**：整合 HTML5 相機捕捉技術，提供介面友善的鏡頭掃描功能，便利律師讀取委託資料或登錄代碼。

### 3. AI 語音問答 (Voice Accessibility)
因應東南亞移工可能不便打字之情境，於現有的 AI Assistant 模組中導入語音體驗：
- **語音輸入 (STT)**：於文字輸入框旁增設麥克風按鈕。啟用時會即時啟動瀏覽器原生的 Speech Recognition 聽寫技術捕捉提問。
- **語音朗讀 (TTS)**：在 AI 回覆的區塊右上角新增「朗讀喇叭按鈕」，可將精準回呼的法規結果用語音念給不方便閱讀長文的移工聽。

### 4. 勞發署 (WDA) 中階技術政策 RAG 擴充
為了涵蓋移工關心的最新特別專案：
- **目標爬取**：從勞發署外國勞動權益網的「留用外國中階技術工作人力計畫」FAQ 專頁中爬取對答內容（[crawl-wda-faq.ts](file:///D:/AMAN/lawbridge/scripts/crawl-wda-faq.ts)）。
- **向量匯入**：建構針對此特定專頁的高維度 Embedding ([embed-wda.ts](file:///D:/AMAN/lawbridge/scripts/embed-wda.ts))，我們成功擷取到如「留用外國中階技術人力無總年限限制」、「如何轉換雇主」等 RAG 塊。現在前端 AI 將能夠精確回答這類針對性的政策問題！
