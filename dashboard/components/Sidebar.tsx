"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";
import { playBeep, useSoundPref } from "@/hooks/useSoundPref";

type NavItem = { href: string; label: string; badge?: number };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "GENEL",
    items: [
      { href: "/", label: "Genel Bakış" },
      { href: "/reservations", label: "Rezervasyonlar" },
      { href: "/calendar", label: "Takvim" },
    ],
  },
  {
    title: "YÖNETİM",
    items: [
      { href: "/slots", label: "Slot Yönetimi" },
      { href: "/stats", label: "İstatistik" },
      { href: "/settings", label: "Ayarlar" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function LogoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  badge,
  active,
  onClick,
}: {
  href: string;
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}) {
  const baseStyle: React.CSSProperties = {
    color: active ? "#ffffff" : "rgba(255,255,255,0.5)",
    fontWeight: active ? 600 : 400,
    fontSize: "13px",
    padding: "9px 12px",
    paddingLeft: "12px",
    borderRadius: "10px",
    borderLeft: active ? "4px solid #fbbf24" : "4px solid transparent",
    background: active ? "rgba(255,255,255,0.15)" : "transparent",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    textDecoration: "none",
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          e.currentTarget.style.color = "rgba(255,255,255,0.9)";
          e.currentTarget.style.paddingLeft = "16px";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          e.currentTarget.style.paddingLeft = "12px";
        }
      }}
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span
          style={{
            background: "#fbbf24",
            color: "#1c1917",
            fontSize: "9px",
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: "99px",
            minWidth: "16px",
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
function SpeakerOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function SoundToggle() {
  const [enabled, setEnabled] = useSoundPref();
  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-label={enabled ? "Bildirim sesini kapat" : "Bildirim sesini aç"}
      title={enabled ? "Bildirim sesi açık" : "Bildirim sesi kapalı"}
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: enabled ? "#fbbf24" : "rgba(255,255,255,0.45)",
        borderRadius: "10px",
        padding: "6px 10px",
        fontSize: "11px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        width: "100%",
        transition: "all 0.15s ease",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.10)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
      }}
    >
      {enabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
      <span style={{ flex: 1, textAlign: "left", color: "rgba(255,255,255,0.7)" }}>
        Bildirim sesi
      </span>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          color: enabled ? "#fbbf24" : "rgba(255,255,255,0.45)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {enabled ? "Açık" : "Kapalı"}
      </span>
    </button>
  );
}

export function Sidebar({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // "/reservations" item'i icin badge: yeni rezervasyon SSE event'lerinde artar.
  // Kullanici Rezervasyonlar sayfasini ziyaret edince sifirlanir.
  const [newCount, setNewCount] = useState(0);
  const lastSeenPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname === "/reservations" && lastSeenPathRef.current !== "/reservations") {
      setNewCount(0);
    }
    lastSeenPathRef.current = pathname;
  }, [pathname]);

  useRealtime({
    onNewReservation: () => {
      // Kullanici Rezervasyonlar sayfasindaysa badge gostermeye gerek yok
      if (window.location.pathname !== "/reservations") {
        setNewCount((c) => c + 1);
      }
      playBeep();
    },
  });

  const sidebarStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #3730a3 0%, #2e1065 100%)",
    width: "220px",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    color: "rgba(255,255,255,0.85)",
  };

  return (
    <>
      {/* Mobile topbar */}
      <div
        className="md:hidden flex items-center justify-between px-4 h-14"
        style={{
          background: "linear-gradient(180deg, #3730a3 0%, #2e1065 100%)",
          color: "#e0e7ff",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Menüyü aç"
          className="p-2 -ml-2"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          <MenuIcon />
        </button>
        <span className="text-sm font-semibold">Deneyim Merkezi</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Çıkış"
          className="p-2 -mr-2"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          <LogoutIcon />
        </button>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30"
          style={{ backgroundColor: "rgba(30,27,75,0.5)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          ...sidebarStyle,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s ease",
        }}
        className="md:!translate-x-0"
      >
        {/* Logo */}
        <div
          style={{
            padding: "20px 16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "12px",
              background: "#e0e7ff",
              color: "#3730a3",
              fontWeight: 700,
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            DM
          </div>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div
              style={{
                color: "#e0e7ff",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Deneyim Merkezi
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "10px",
                letterSpacing: "0.1em",
                marginTop: "2px",
                textTransform: "uppercase",
              }}
            >
              Yönetim Paneli
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 12px",
          }}
        >
          {NAV.map((group) => (
            <div key={group.title}>
              <div
                style={{
                  fontSize: "10px",
                  color: "#ffffff",
                  opacity: 0.5,
                  letterSpacing: "0.15em",
                  fontWeight: 600,
                  padding: "20px 4px 6px",
                  textTransform: "uppercase",
                }}
              >
                {group.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    badge={
                      item.href === "/reservations" && newCount > 0
                        ? newCount
                        : item.badge
                    }
                    active={isActive(pathname, item.href)}
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sound toggle */}
        <div style={{ padding: "0 12px 8px" }}>
          <SoundToggle />
        </div>

        {/* User footer */}
        <div style={{ padding: "12px" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: "12px",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "50%",
                background: "#e0e7ff",
                color: "#3730a3",
                fontWeight: 700,
                fontSize: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {(userName || "U").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <div
                style={{
                  color: "#e0e7ff",
                  fontSize: "12px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userName}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "10px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userEmail}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Çıkış"
              style={{
                color: "rgba(255,255,255,0.3)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                transition: "color 0.15s ease",
                flexShrink: 0,
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.color = "rgba(255,255,255,0.8)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.color = "rgba(255,255,255,0.3)")
              }
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
