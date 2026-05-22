import { EventEmitter } from "node:events";

export type AppEventName =
  | "new_reservation"
  | "reservation_updated";

export type AppEventPayload = {
  type: AppEventName;
  reservationId?: string;
  status?: string;
  visitorName?: string;
};

class AppBus extends EventEmitter {}

// Modul-singleton EventEmitter. Multi-process'te (Railway worker'lar) farkli
// instance'lar olur — gercek dagitik pub/sub icin Redis pub/sub gerek; simdilik
// tek instance icin yeterli.
export const eventBus = new AppBus();
eventBus.setMaxListeners(50); // birden cok SSE client desteklesin

export function emitAppEvent(payload: AppEventPayload): void {
  eventBus.emit(payload.type, payload);
}
