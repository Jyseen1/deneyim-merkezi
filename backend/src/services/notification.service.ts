import { prisma } from "../db/client";

export type NotificationDirection = "outbound" | "inbound";

export type NotificationLog = {
  reservationId?: string | null;
  channel: string; // "whatsapp"
  direction: NotificationDirection;
  templateName?: string | null;
  waMessageId?: string | null;
  status?: string; // "sent" | "delivered" | "read" | "failed"
};

// Notification kaydi. Sessiz hata: log basarisiz olursa main akisi bozmaz.
export async function logNotification(data: NotificationLog): Promise<void> {
  if (!data.reservationId) {
    // Notification modeli reservationId zorunlu — rezervasyona bagli olmayan
    // genel sistem mesajlari icin (test mesaji vs.) kayit atlanir.
    return;
  }
  try {
    await prisma.notification.create({
      data: {
        reservationId: data.reservationId,
        channel: data.channel,
        direction: data.direction,
        templateName: data.templateName ?? undefined,
        waMessageId: data.waMessageId ?? undefined,
        status: data.status ?? "sent",
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "notifications",
        msg: "logNotification hata",
        err: (err as Error).message,
        data,
      }),
    );
  }
}

// Meta'dan gelen status webhook'unda (sent/delivered/read/failed) mevcut
// kayidi guncelle. waMessageId esleserse status'u yeni degere set eder.
export async function updateNotificationStatus(
  waMessageId: string,
  status: string,
): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { waMessageId },
      data: { status },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "notifications",
        msg: "updateNotificationStatus hata",
        waMessageId,
        status,
        err: (err as Error).message,
      }),
    );
  }
}
