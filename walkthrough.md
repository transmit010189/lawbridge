# LawBridge Walkthrough

更新日期：2026-03-21

## 1. 本次完成範圍

這次完成的是三條主線的收斂與重建：

1. 官方法規、WDA 中階技術專區、附件圖卡的 RAG corpus 補齊
2. RAG 查詢路徑改成「向量檢索 + lexical 補強」混合檢索
3. 模型設定、walkthrough 文件、Firebase 線上資料同步更新

## 2. 模型設定

模型設定集中於 `src/lib/ai/geminiModels.ts`。

- generation / chat / vision 預設：`models/gemini-3.1-flash-lite-preview`
- Gemini API embedding fallback：`models/gemini-embedding-001`
- Vertex AI embedding 主線：`gemini-embedding-2-preview`

關鍵行為：

- `src/lib/ai/embeddingClient.ts` 會先走 Vertex AI Embedding 2
- 如果 Vertex 憑證不存在或呼叫失敗，才 fallback 到 Gemini API embedding
- `src/app/api/rag/route.ts` 與 `scripts/embed-and-upload.ts` 已共用相同 embedding client

官方文件：

- Gemini 3.1 Flash-Lite Preview
  `https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview?hl=zh-tw`
- Gemini Embedding 2
  `https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2?hl=zh-tw`

## 3. 指定法規確認

你指定的兩條法規都已存在於 corpus 與 chunk：

- `N0090027` 雇主聘僱外國人許可及管理辦法
- `L0050018` 受聘僱外國人健康檢查管理辦法

對應檔案：

- `data/laws/N0090027.json`
- `data/laws/L0050018.json`
- `data/chunks/N0090027.json`
- `data/chunks/L0050018.json`

補充：

- `L0050018` 共 `18` 條條文 chunk
- `_all_chunks.json` 中以「健康檢查」關鍵字可命中 `47` 筆相關 chunk

## 4. WDA 中階技術專區覆蓋

WDA root：
`https://fw.wda.gov.tw/wda-employer/home/mid-foreign-labor?locale=zh`

`scripts/crawl-wda-faq.ts` 現在會做三件事：

- 直接解析 root page 右側 accordion 的真實入口，不再只抓首頁說明文
- 下載 `a[href]` 附件、頁面內嵌 `iframe/embed/object` 附件
- 下載頁面內容區內的 inline `img` 圖卡，納入 `raguse/` 後續 OCR

已納入的 section：

- 最新消息
- 法規
- 申請流程及須知
- 專業證照
- 訓練課程
- 實作認定
- 申請文件下載
- 線上申辦/進度查詢
- 移工在職進修
- 問與答QA

實際輸出：

- WDA 頁面 records：`280`
- WDA FAQ chunks：`305`

## 5. 你特別要求的區塊

本次已確認下列區塊都已進入 WDA corpus：

- 專業證照：`17` 頁
- 訓練課程：`16` 頁
- 實作認定：`5` 頁
- 問與答QA：`154` 頁

問與答QA 12 章分布如下：

- 壹、總則篇：`8`
- 貳、雇主篇-申請資格章：`15`
- 參、雇主篇-聘僱流程章：`15`
- 肆、雇主篇-轉換雇主：`15`
- 伍、雇主篇-聘僱管理：`15`
- 陸、雇主篇-其他：`15`
- 柒、仲介篇-申請資格章：`6`
- 捌、仲介篇-聘僱流程章：`15`
- 玖、仲介篇-轉換及接續聘僱章：`13`
- 拾、仲介篇-聘僱管理章：`15`
- 拾壹、仲介篇-私立就業服務機構章：`7`
- 拾貳、移工篇：`15`

## 6. 附件、附表與圖卡

附件統一下載到 `raguse/`，再由 `scripts/extract-rag-attachments.ts` 抽字。

目前支援：

- PDF
- JPG / JPEG
- PNG / WEBP
- DOCX
- ODT

這次實際掃描結果：

- `raguse/` 附件總數：`343`
- 去重後有效附件文本：`89`

包含範圍：

- 法規附表
- 申請流程圖
- 懶人包圖卡
- 問答 PDF
- 內嵌圖卡與 inline 圖片
- DOCX / ODT 書表或證明文件

## 7. RAG 組成結果

`npm run rag:build` 最新結果：

- 總 chunk：`1066`
- `law`：`516`
- `wda_policy`：`123`
- `wda_faq`：`305`
- `attachment`：`122`

`npm run rag:upload` 最新結果：

- 上傳 sources：`501`
- 上傳 chunks：`1066`
- 向量欄位：`embedding`
- 維度：`768`
- 距離：`COSINE`

## 8. 檢索路徑更新

`src/app/api/rag/route.ts` 已改成混合檢索：

- 第一層：Firestore `findNearest` 向量查詢
- 第二層：`searchTokens` 的 lexical 候選補強
- 第三層：本地 rerank，依標題、章節、內容與 lexical overlap 重新排序

目的：

- 避免像「中階技術人力需要辦理健康檢查嗎」這種精準問句只被向量近鄰帶偏
- 讓 FAQ 標題命中與法規條文命中都能進入最終上下文

## 9. 文件完成度

`walkthrough.md` 與 `walkthrough0321.md` 都已完成更新，內容與目前程式與資料輸出一致。

## 10. 執行順序

1. `npm run rag:crawl:wdafaq`
2. `npm run rag:attachments`
3. `npm run rag:build`
4. `npm run rag:upload`
5. Firebase deploy
