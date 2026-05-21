export type ReservationStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED";

export type Visitor = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
};

export type Reservation = {
  id: string;
  visitorId: string;
  visitor?: Visitor;
  visitDate: string;
  startTime: string;
  durationMinutes: number;
  groupSize: number;
  note: string | null;
  status: ReservationStatus;
  waMessageId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
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
  utilizationPct: number;
  pendingPreview: Reservation[];
};

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "Bekliyor",
  APPROVED: "Onaylı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
  COMPLETED: "Tamamlandı",
};

export const STATUS_BADGE: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
  COMPLETED: "bg-blue-100 text-blue-800 border-blue-200",
};
