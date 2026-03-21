// ============================================================
// Core type definitions for LawBridge MVP
// ============================================================

// -- User roles --
export type UserRole = "worker" | "lawyer" | "admin";

// -- Supported languages --
export type SupportedLocale = "zh-TW" | "en" | "id" | "vi" | "th";

// -- User (Firestore: users/{uid}) --
export interface User {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  phone: string;
  language: SupportedLocale;
  nationality?: string;
  status: "active" | "suspended" | "pending";
  emailVerified?: boolean;
  testCreditsGrantedAt?: string;
  gps?: { lat: number; lng: number };
  createdAt: string;
  updatedAt: string;
}

// -- Lawyer Profile (Firestore: lawyer_profiles/{uid}) --
export interface LawyerProfile {
  uid: string;
  fullName: string;
  licenseNo: string;
  licenseStatus: "pending" | "verified" | "rejected" | "offboarded";
  verificationStage?:
    | "draft"
    | "documents_submitted"
    | "manual_review"
    | "video_review_required"
    | "verified";
  verificationId?: string;
  verifiedName?: string;
  payoutBankLast4?: string;
  payoutAccountVerified?: boolean;
  payoutScheduleNote?: string;
  payoutEtaNote?: string;
  complianceAcceptedAt?: string;
  complianceVersion?: string;
  translationAssistEnabled?: boolean;
  specialties: string[];
  serviceLanguages: SupportedLocale[];
  ratingAvg: number;
  ratingCount: number;
  bio: string;
  ratePerMinute: number; // points per minute
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

// -- Lawyer Verification (Firestore: lawyer_verifications/{id}) --
export interface LawyerVerification {
  uid: string;
  certificateImagePath: string;
  certificateOcrText: string;
  certificateName?: string;
  certificateLicenseNo?: string;
  bankImagePath?: string;
  bankOcrText?: string;
  bankAccountHolderName?: string;
  bankAccountLast4?: string;
  nameMatches?: boolean;
  licenseNoSubmitted: string;
  govCheckResult: "matched" | "manual_review" | "failed";
  ndaAccepted: boolean;
  complianceAcceptedAt?: string;
  complianceVersion?: string;
  videoReviewRequired?: boolean;
  reviewerId?: string;
  reviewNotes?: string;
  createdAt: string;
  completedAt?: string;
}

// -- Wallet (Firestore: wallets/{uid}) --
export interface Wallet {
  uid: string;
  pointsBalance: number;
  currency: "TWD";
  availablePayoutPoints?: number;
  pendingPayoutPoints?: number;
  updatedAt: string;
}

// -- Transaction (Firestore: wallet_transactions/{txnId}) --
export type TransactionType =
  | "topup"
  | "consult_charge"
  | "subscription_charge"
  | "lawyer_payout"
  | "refund"
  | "platform_fee";

export type PaymentGateway = "ecpay" | "newebpay";
export type PaymentMethod = "card" | "cvs";
export type TransactionStatus = "pending" | "settled" | "failed";

export interface WalletTransaction {
  id: string;
  uid: string;
  type: TransactionType;
  points: number; // positive = credit, negative = debit
  amountTwd: number;
  consultationId?: string;
  paymentRef?: string;
  gateway?: PaymentGateway;
  paymentMethod?: PaymentMethod;
  status: TransactionStatus;
  paymentCode?: string;
  paymentInstructions?: string;
  paymentExpiresAt?: string;
  gatewayTradeNo?: string;
  gatewayMessage?: string;
  settledAt?: string;
  updatedAt?: string;
  createdAt: string;
}

// -- Subscription (Firestore: subscriptions/{uid}) --
export interface Subscription {
  uid: string;
  plan: "free" | "pro";
  status: "active" | "expired" | "cancelled";
  aiDailyQuota: number;
  startedAt: string;
  expiresAt: string;
}

// -- Consultation (Firestore: consultations/{id}) --
export interface Consultation {
  id: string;
  workerUid: string;
  lawyerUid: string;
  workerDisplayName?: string;
  workerLanguage?: SupportedLocale;
  workerNationality?: string;
  status: "requested" | "matched" | "in_progress" | "completed" | "cancelled";
  mode: "audio" | "text";
  ratePerMinute?: number;
  startedAt?: string;
  endedAt?: string;
  durationSec: number;
  chargePoints: number;
  platformFeePoints: number;
  lawyerPayoutPoints: number;
  languageFrom: SupportedLocale;
  languageTo: SupportedLocale;
  translationMode?: "none" | "subtitle_assist";
  recordingPath?: string;
  recordingHash?: string;
  recordingCount?: number;
  recordingUpdatedAt?: string;
  recordingLatestPath?: string;
  createdAt: string;
}

export interface ConsultationRecording {
  id: string;
  consultationId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  uploadedByUid: string;
  uploadedByRole: "worker" | "lawyer";
  durationSec?: number;
}

// -- Rating (Firestore: ratings/{id}) --
export interface Rating {
  id: string;
  consultationId: string;
  workerUid: string;
  lawyerUid: string;
  stars: 1 | 2 | 3 | 4 | 5;
  comment: string;
  labels?: string[];
  createdAt: string;
}
