import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <div className="page-bg" aria-hidden="true" />
      <div className="bg-dots" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-conic" aria-hidden="true" />
      <Sidebar
        userName={session.user?.name ?? "Kullanıcı"}
        userEmail={session.user?.email ?? ""}
      />
      <main
        className="min-h-screen md:ml-[220px] px-5 py-6 md:px-9 md:py-8"
      >
        {children}
      </main>
    </>
  );
}
