import type { Reservation, Visitor } from "@prisma/client";

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
