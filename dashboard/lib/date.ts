export const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export const TR_DAYS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

// Pazartesi indekslemesi (0 = Pzt … 6 = Paz)
export const TR_DAYS_SHORT_MON = [
  "Pzt",
  "Sal",
  "Çar",
  "Per",
  "Cum",
  "Cmt",
  "Paz",
];

function asDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTrLongDate(d: Date | string): string {
  const date = asDate(d);
  return `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTrShortDate(d: Date | string): string {
  const date = asDate(d);
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatTrDayName(d: Date | string): string {
  return TR_DAYS[asDate(d).getDay()];
}

export function formatTrDateTime(d: Date | string): string {
  const date = asDate(d);
  return `${formatTrShortDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatTrMonthYear(year: number, monthIdx: number): string {
  return `${TR_MONTHS[monthIdx]} ${year}`;
}

// "YYYY-MM-DD" (UTC bagimsiz, takvim grid yapimi icin lokal degerler)
export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Pazartesi=0 olacak sekilde haftanin gun indeksi
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

// Ay aralığı: [startISO, endISO) (endISO sonraki ayın ilk gunu)
export function monthRange(year: number, monthIdx: number): {
  start: Date;
  end: Date;
  startISO: string;
  endISO: string;
} {
  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 1);
  return {
    start,
    end,
    startISO: toLocalIso(start),
    endISO: toLocalIso(end),
  };
}

// Bir aylik takvim grid'i: 42 hucre (6 hafta). Pazartesi ile baslar.
export function calendarCells(year: number, monthIdx: number): Date[] {
  const first = new Date(year, monthIdx, 1);
  const leadMon = mondayIndex(first);
  const startCell = new Date(year, monthIdx, 1 - leadMon);
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    out.push(new Date(startCell.getFullYear(), startCell.getMonth(), startCell.getDate() + i));
  }
  return out;
}

export function addMonths(year: number, monthIdx: number, delta: number) {
  const d = new Date(year, monthIdx + delta, 1);
  return { year: d.getFullYear(), monthIdx: d.getMonth() };
}
