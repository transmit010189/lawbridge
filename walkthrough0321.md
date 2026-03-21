# Walkthrough 2026-03-21

## 模型

- generation / chat / vision：`models/gemini-3.1-flash-lite-preview`
- embedding 主線：`gemini-embedding-2-preview`
- embedding fallback：`models/gemini-embedding-001`

官方文件：

- `https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview?hl=zh-tw`
- `https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2?hl=zh-tw`

## 指定法規

以下已確認存在於 laws 與 chunks：

- `N0090027`
- `L0050018`

## WDA 覆蓋

已納入：

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

重點數量：

- WDA pages：`280`
- 專業證照：`17`
- 訓練課程：`16`
- 實作認定：`5`
- 問與答QA：`154`

QA 12 章：

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

## 附件

- `raguse/` 已掃描：`343`
- 去重後有效附件文本：`89`
- 支援：PDF、JPG/JPEG、PNG/WEBP、DOCX、ODT
- 頁面內 inline 圖卡與內嵌 PDF 已納入抽取

## RAG 結果

- `_all_chunks.json`：`1066`
- `law`：`516`
- `wda_policy`：`123`
- `wda_faq`：`305`
- `attachment`：`122`

## 查詢策略

`/api/rag` 已改為：

1. 向量查詢
2. lexical `searchTokens` 補強
3. rerank 後送 LLM 回答

## 執行順序

1. `npm run rag:crawl:wdafaq`
2. `npm run rag:attachments`
3. `npm run rag:build`
4. `npm run rag:upload`
5. Firebase deploy
