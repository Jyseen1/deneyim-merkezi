import { redirect } from "next/navigation";

// Slot Yonetimi sayfasi /calendar icine tasindi. Eski URL'leri kirmamak
// icin permanent redirect.
export default function SlotsRedirect(): never {
  redirect("/admin/calendar");
}
