# LawBridge 法橋 — 外籍勞工法律諮詢 Web App

## Project Overview
A web app (Next.js on Firebase) connecting foreign workers in Taiwan with licensed lawyers.
Multi-language (zh-TW, en, id, vi, th), point-based billing, convenience store payments.

## Tech Stack
- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS 4
- **Auth**: Firebase Authentication
- **Database**: Cloud Firestore (real-time) + PostgreSQL (transactions, planned)
- **Storage**: Cloud Storage for Firebase (recordings, documents)
- **Hosting**: Firebase App Hosting
- **API**: Next.js API routes → Cloud Run (later)
- **Payment**: ECPay or NewebPay (convenience store barcode)
- **AI (V1.0)**: Gemini Embedding + RAG + Qwen 3.5 for legal Q&A

## Key Directories
- `src/lib/firebase/` — Firebase client & admin SDK init
- `src/types/` — TypeScript type definitions (User, Lawyer, Wallet, Consultation, etc.)
- `src/messages/` — i18n translation files (zh-TW, en, id, vi, th)
- `src/hooks/` — React hooks (useAuth, etc.)
- `src/app/` — Next.js App Router pages
- `src/app/api/` — Server-side API routes

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Build for production
- `npm run lint` — Run ESLint

## Important Conventions
- Mobile-first responsive design (target: migrant worker smartphones)
- Icon-heavy UI, minimal text (users may have low Chinese literacy)
- All financial transactions use double-entry ledger pattern
- Recordings stored as Ogg/Opus with SHA-256 hash for evidence integrity
