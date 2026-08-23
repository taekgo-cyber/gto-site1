/**
 * Provider-neutral payment boundary - Gate 3 STATIC/ISOLATED
 * - Defines shape only: createPayment, confirmPayment, handleWebhook, cancelPayment, refundPayment
 * - No provider implementation, credentials, live calls, PG adapters, or webhook handlers.
 * - Money (KRW integer) and Credit integer are separate types; no pricing/product logic here.
 * - Foundation only; no numeric price/quota constants.
 */
import type { CreditAmount, MoneyKRW } from "@/lib/credits/types";

// Branded re-export for consumers
export type { CreditAmount, MoneyKRW };

export type PaymentId = string;
export type IdempotencyKey = string;

export type PaymentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "REFUNDED" | "FAILED";

// Foundation payment request/response shapes - intentionally minimal
export type CreatePaymentInput = {
  companyId: string; // economic owner
  actorUserId?: string | null; // provenance distinct from owner
  amountKrw: MoneyKRW; // KRW integer, not credit
  creditAmount?: CreditAmount | null; // optional credit projection, no conversion logic
  idempotencyKey: IdempotencyKey; // prevents duplicate create
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreatePaymentResult = {
  paymentId: PaymentId;
  status: PaymentStatus;
  amountKrw: MoneyKRW;
  idempotencyKey: IdempotencyKey;
  providerRef?: string | null;
};

export type ConfirmPaymentInput = {
  paymentId: PaymentId;
  idempotencyKey?: IdempotencyKey | null;
  actorUserId?: string | null;
};

export type ConfirmPaymentResult = {
  paymentId: PaymentId;
  status: PaymentStatus;
  confirmedAt?: Date | null;
};

export type HandleWebhookInput = {
  rawBody: string;
  signature?: string | null;
  headers?: Record<string, string>;
};

export type HandleWebhookResult = {
  paymentId: PaymentId | null;
  status: PaymentStatus | null;
  eventType: string;
  idempotencyKey?: IdempotencyKey | null;
};

export type CancelPaymentInput = {
  paymentId: PaymentId;
  actorUserId?: string | null;
  idempotencyKey?: IdempotencyKey | null;
  reason?: string | null;
};

export type CancelPaymentResult = {
  paymentId: PaymentId;
  status: PaymentStatus;
};

export type RefundPaymentInput = {
  paymentId: PaymentId;
  amountKrw?: MoneyKRW | null; // partial refund allowance in shape only, no policy
  actorUserId?: string | null;
  idempotencyKey: IdempotencyKey;
  reason?: string | null;
};

export type RefundPaymentResult = {
  paymentId: PaymentId;
  status: PaymentStatus;
  refundId?: string | null;
  amountKrw?: MoneyKRW | null;
};

/**
 * Provider-neutral boundary interface.
 * All methods are shape-only; implementations must not be added in Gate 3.
 */
export interface PaymentProviderBoundary {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult>;
  handleWebhook(input: HandleWebhookInput): Promise<HandleWebhookResult>;
  cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}

// Type-only shape assertion helper for tests (no runtime)
export type AssertPaymentBoundaryShape<T extends PaymentProviderBoundary> = T;
