"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

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
    color: active ? "var(--gx-text)" : "var(--gx-text-muted)",
    fontWeight: active ? 600 : 500,
    fontSize: "13px",
    padding: "10px 12px",
    paddingLeft: active ? "16px" : "12px",
    borderRadius: "10px",
    borderLeft: active
      ? "3px solid var(--gx-accent-light)"
      : "3px solid transparent",
    // Aktif: sol mor cubuk + soft mor cam dolgu
    background: active
      ? "linear-gradient(90deg, rgba(124,58,237,0.20), rgba(124,58,237,0.04))"
      : "transparent",
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
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          e.currentTarget.style.color = "var(--gx-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--gx-text-muted)";
        }
      }}
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span
          style={{
            background: "var(--gx-gradient)",
            color: "#ffffff",
            fontSize: "10px",
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: "99px",
            minWidth: "18px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(124,58,237,0.4)",
          }}
        >
          {badge}
        </span>
      )}
    </Link>
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
      if (window.location.pathname !== "/reservations") {
        setNewCount((c) => c + 1);
      }
    },
  });

  // Koyu sidebar — sag kenarda ince mor cizgi
  const sidebarStyle: React.CSSProperties = {
    background: "var(--gx-bg-deep)",
    width: "220px",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    color: "var(--gx-text)",
    borderRight: "1px solid var(--gx-border)",
    boxShadow: "1px 0 0 rgba(124,58,237,0.15)",
  };

  return (
    <>
      {/* Mobile topbar */}
      <div
        className="md:hidden flex items-center justify-between px-4 h-14"
        style={{
          background: "var(--gx-bg-deep)",
          color: "var(--gx-text)",
          position: "sticky",
          top: 0,
          zIndex: 30,
          borderBottom: "1px solid var(--gx-border)",
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Menüyü aç"
          className="p-2 -ml-2"
          style={{ color: "var(--gx-text)" }}
        >
          <MenuIcon />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gigax-logo.png"
          alt="GigaX"
          style={{ height: "22px", width: "auto" }}
        />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Çıkış"
          className="p-2 -mr-2"
          style={{ color: "var(--gx-text-muted)" }}
        >
          <LogoutIcon />
        </button>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
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
            padding: "20px 18px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            borderBottom: "1px solid var(--gx-border)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gigax-logo.png"
            alt="GigaX"
            style={{ height: "30px", width: "auto", flexShrink: 0 }}
          />
          <div
            style={{
              color: "var(--gx-text-muted)",
              fontSize: "10px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            Yönetim
            <br />
            Paneli
          </div>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 12px",
          }}
        >
          {NAV.map((group) => (
            <div key={group.title}>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gx-text-hint)",
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  padding: "20px 4px 8px",
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

        {/* User footer */}
        <div style={{ padding: "12px" }}>
          <div
            style={{
              background: "var(--gx-surface)",
              border: "1px solid var(--gx-border)",
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
                background: "var(--gx-gradient)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(124,58,237,0.35)",
              }}
            >
              {(userName || "U").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <div
                className="font-display"
                style={{
                  color: "var(--gx-text)",
                  fontSize: "13px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: "-0.01em",
                }}
              >
                {(userName || "").trim().split(/\s+/)[0] || "Kullanıcı"}
              </div>
              <div
                style={{
                  color: "var(--gx-text-hint)",
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
                color: "var(--gx-text-hint)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                transition: "color 0.15s ease",
                flexShrink: 0,
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.color = "var(--gx-danger)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.color = "var(--gx-text-hint)")
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
