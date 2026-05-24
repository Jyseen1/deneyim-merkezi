import type { Reservation, Visitor } from "@prisma/client";
import type { ProductSlug } from "./product";

export type ReservationWithVisitor = Reservation & { visitor: Visitor };

export type CreateReservationInput = {
  name: string;
  phone: string;
  email?: string;
  visitDate: string; // ISO tarih: "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  durationMinutes?: number;
  groupSize?: number;
  note?: string;
  // Yeni rezervasyonlarda zorunlu (form validation enforce eder); type-system
  // de zorunlu tutuyor ki yeni cagri noktalari unutmasin.
  product: ProductSlug;
  source?: "web" | "whatsapp" | "telegram";
  telegramChatId?: string;
};

export type AvailableSlot = {
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

export class SlotUnavailableError extends Error {
  readonly alternatives: AvailableSlot[];
  constructor(message: string, alternatives: AvailableSlot[] = []) {
    super(message);
    this.name = "SlotUnavailableError";
    this.alternatives = alternatives;
  }
}

// approveReservation/rejectReservation: rezervasyon zaten PENDING_APPROVAL
// degilse atilir. Hem site hem Telegram hem WhatsApp icin tek noktada
// duplicate islem engellenir.
export class ReservationAlreadyProcessedError extends Error {
  readonly currentStatus: string;
  constructor(currentStatus: string) {
    super(`Bu rezervasyon zaten işlenmiş (durum: ${currentStatus})`);
    this.name = "ReservationAlreadyProcessedError";
    this.currentStatus = currentStatus;
  }
}

// Spam kontrolu: ayni telefondan cok fazla bekleyen rezervasyon varsa atilir.
// Route bunu 429 ile kullaniciya doner. Limit Settings'ten degisebilir.
export class TooManyPendingReservationsError extends Error {
  readonly pendingCount: number;
  readonly limit: number;
  constructor(pendingCount: number, limit: number) {
    super(
      `Çok fazla bekleyen talebiniz var (${pendingCount}/${limit}). Lütfen mevcut taleplerinizin onaylanmasını bekleyin.`,
    );
    this.name = "TooManyPendingReservationsError";
    this.pendingCount = pendingCount;
    this.limit = limit;
  }
}
