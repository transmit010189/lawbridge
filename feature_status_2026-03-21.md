# LawBridge Feature Status

Updated: 2026-03-21

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | i18n | Completed | Centralized message files and `useTranslation` are wired into the main app screens. |
| 2 | NewebPay payment flow | Partial | The wallet flow now targets NewebPay and direct top-up is disabled. Merchant credentials are still required before production checkout can be enabled. |
| 3 | Lawyer OCR | Completed | Certificate upload, Gemini Vision OCR verification, and profile status updates are implemented. |
| 4 | Call recording | Completed | Mixed-stream recording upload, metadata retention, participant-only playback/download access, and profile history management are implemented. |
| 5 | Lawyer rating | Completed | Post-call rating submission and lawyer rating recalculation are implemented. |
| 6 | ErrorBoundary | Completed | The entire app is wrapped by a shared error boundary. |
| 7 | Skeleton loading | Completed | Shared skeleton components are integrated across dashboard and list views. |
| 8 | AI quota | Completed | Daily quota API with free and pro limits is implemented and used by the AI chat UI. |

## Summary

- MVP-complete features: `1`, `3`, `5`, `6`, `7`, `8`
- Partially complete features: `2`
- Main release blocker fixed on 2026-03-21: old Gemini generation model references caused `404 NOT_FOUND` errors for new users.
