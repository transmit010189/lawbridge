# LawBridge

LawBridge 是一個以 Next.js + Firebase 建立的勞動法協作 Web App，現在已具備：

- RWD 自適應介面
- Firebase Authentication / Firestore 前後端串接
- `/api/rag` 向量檢索問答
- WDA 政策法令爬蟲與 RAG corpus 建置腳本

## 現在可以對外測試嗎？

可以，但要部署到支援 Next.js Server 的平台。

目前 repo 裡的 [firebase.json](D:/AMAN/lawbridge/firebase.json) 還保留舊的 static hosting 設定，這不適合現在這個有 API routes 的版本。外部測試建議用：

1. Vercel
2. Firebase App Hosting

原因是目前前端會呼叫：

- [src/app/api/rag/route.ts](D:/AMAN/lawbridge/src/app/api/rag/route.ts)
- [src/app/api/chat/route.ts](D:/AMAN/lawbridge/src/app/api/chat/route.ts)

這些都需要 server runtime，不能用純靜態 hosting。

## 後端在哪裡？

主要後端位置如下：

- RAG API: [src/app/api/rag/route.ts](D:/AMAN/lawbridge/src/app/api/rag/route.ts)
- 一般聊天 API: [src/app/api/chat/route.ts](D:/AMAN/lawbridge/src/app/api/chat/route.ts)
- Firebase Admin 初始化: [src/lib/firebase/admin.ts](D:/AMAN/lawbridge/src/lib/firebase/admin.ts)
- Firebase client 設定: [src/lib/firebase/config.ts](D:/AMAN/lawbridge/src/lib/firebase/config.ts)
- 認證流程: [src/hooks/useAuth.ts](D:/AMAN/lawbridge/src/hooks/useAuth.ts)

## 前端在哪裡？

- App shell / 首頁流程: [src/app/page.tsx](D:/AMAN/lawbridge/src/app/page.tsx)
- 登入頁: [src/components/auth/LoginPage.tsx](D:/AMAN/lawbridge/src/components/auth/LoginPage.tsx)
- RAG AI 問答頁: [src/components/consultation/AiChatPage.tsx](D:/AMAN/lawbridge/src/components/consultation/AiChatPage.tsx)
- 律師列表: [src/components/lawyer/LawyerListPage.tsx](D:/AMAN/lawbridge/src/components/lawyer/LawyerListPage.tsx)
- 錢包頁: [src/components/wallet/WalletPage.tsx](D:/AMAN/lawbridge/src/components/wallet/WalletPage.tsx)

## 品牌素材

目前已使用下列圖片素材並複製到 `public/brand/`：

- `image/logo/lawbridge_logo_concept_1774014572617.png`
- `image/background/hero_background_abstract_1774014591086.png`
- `image/Web App  Dashboard/dashboard_background_light_1774014608852.png`

## 本機開發

```bash
npm install
npm run dev
```

打開 `http://localhost:3000`。

## 必要環境變數

請在 `.env.local` 設定：

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
GEMINI_API_KEY=
FIREBASE_SERVICE_ACCOUNT_KEY=
```

如果部署在雲端 server runtime，也可以改用平台提供的 service account / application default credentials。

## WDA 與法規 RAG 管線

### 1. 爬 WDA 政策法令

```bash
npm run rag:crawl:wdapolicy
```

輸出到：

- `data/wda_policies/*.json`

### 2. 建立統一 RAG chunks

```bash
npm run rag:build
```

這會把：

- `data/laws/*.json`
- `data/wda_policies/*.json`

轉成：

- `data/chunks/*.json`
- `data/chunks/_all_chunks.json`

### 3. 產生 embedding 並上傳 Firestore

```bash
npm run rag:upload
```

會寫入：

- `kb_sources`
- `kb_chunks`

## 外部部署建議

### 方案 A: Vercel

最快。把 repo 連上 Vercel，設定所有 `.env.local` 對應環境變數即可。

### 方案 B: Firebase App Hosting

適合想留在 Firebase 生態系。Firebase 官方文件指出 App Hosting 支援 Next.js 動態應用與 server routes：

- https://firebase.google.com/docs/app-hosting
- https://firebase.google.com/docs/app-hosting/configure

## 驗證

```bash
npm run lint
npm run build
```
