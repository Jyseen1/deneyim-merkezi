export type ReservationStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type Visitor = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
};

export type StaffNotificationStatus = "sent" | "failed" | "pending";

export type Reservation = {
  id: string;
  visitorId: string;
  visitor?: Visitor;
  visitDate: string;
  startTime: string;
  durationMinutes: number;
  groupSize: number;
  note: string | null;
  // Slug (lib/products.ts); eski rezervasyonlarda null. Label icin productLabel().
  product: string | null;
  status: ReservationStatus;
  waMessageId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  // Backend her GET'te hesaplar: en son outbound + staff_approval notification
  // status'u. "pending" hic gonderilmemis, "failed" basarisiz, "sent" basarili.
  staffNotificationStatus?: StaffNotificationStatus;
};

export type ReservationList = {
  items: Reservation[];
  total: number;
  page: number;
  limit: number;
};

export type DashboardStats = {
  today: number;
  pending: number;
  thisWeek: number;
  // Genel Bakış 4. stat kartı — backend /dashboard/stats'a sonradan eklendi,
  // geriye dönük uyum için opsiyonel.
  thisMonth?: number;
  utilizationPct: number;
  pendingPreview: Reservation[];
  // Hero sağ üst sistem durumu chip'leri. Backend göndermezse client tarafı
  // güvenli fallback (`backendOnline: true` cevap geldiyse, telegram bilinmiyor).
  system?: {
    backendOnline: boolean;
    telegramConnected: boolean;
  };
};

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "Bekliyor",
  APPROVED: "Onaylı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
  COMPLETED: "Tamamlandı",
  NO_SHOW: "Gelmedi",
};

export const STATUS_BADGE: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
  COMPLETED: "bg-blue-100 text-blue-800 border-blue-200",
  NO_SHOW: "bg-orange-100 text-orange-800 border-orange-200",
};
