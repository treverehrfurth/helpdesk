import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import type { NotificationRecord, UserRole } from "@it-helpdesk/shared";

import { useMockApi } from "../lib/auth/config";
import { apiClient } from "../lib/api/http";
import { useSession } from "../features/auth/AuthProvider";
import brandLogo from "../assets/brand-logo.png";

export type NavItem = {
  to: string;
  label: string;
  detail?: string;
  badge?: string;
  divided?: boolean;
  external?: boolean;
};

const ROLE_LABELS: Record<UserRole, string> = {
  end_user: "User",
  tech: "Tech",
  admin: "Admin"
};

type AppShellProps = {
  navItems: NavItem[];
  userName: string;
  userRole: UserRole;
  authMode: "mock" | "entra";
  canSwitchRole: boolean;
  isPreviewingRole: boolean;
  onRoleChange: (value: UserRole) => void;
  onSignOut: () => void;
  children: React.ReactNode;
};

function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function BellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function AppShell({
  navItems,
  userName,
  userRole,
  authMode,
  canSwitchRole,
  isPreviewingRole,
  onRoleChange,
  onSignOut,
  children
}: AppShellProps) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelPos, setPanelPos] = useState<{
    top?: number; bottom?: number; left?: number; right?: number; mobile?: boolean;
  } | null>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const mobileBellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelSourceRef = useRef<"sidebar" | "topbar" | null>(null);
  const pendingMarkIds = useRef<Set<string>>(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const { requestHeaders, isAuthenticated, isReady } = useSession();

  useEffect(() => {
    if (!identityOpen) return;
    function onDown(e: MouseEvent) {
      if (identityRef.current && !identityRef.current.contains(e.target as Node)) {
        setIdentityOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [identityOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Close sidebar and notification panel on navigation
  useEffect(() => {
    setSidebarOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  // Auto-mark notifications read when on the corresponding ticket page.
  // Runs on pathname change (in-app nav) and when notifications load (deep links / first poll).
  // pendingMarkIds guards against re-firing for IDs already in-flight.
  useEffect(() => {
    if (!isAuthenticated || !isReady) return;
    const match = location.pathname.match(/\/tickets\/([0-9a-f-]{36})$/i);
    if (!match) return;
    const ticketId = match[1];

    const unread = notifications.filter(
      (n) => n.ticketId === ticketId && !n.isRead && !pendingMarkIds.current.has(n.id)
    );
    if (unread.length === 0) return;

    unread.forEach((n) => pendingMarkIds.current.add(n.id));

    for (const notif of unread) {
      void apiClient.markNotificationRead(notif.id, requestHeaders)
        .catch(() => {
          // On failure, remove from guard so the next poll can retry
          pendingMarkIds.current.delete(notif.id);
        });
    }
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => unread.some((u) => u.id === n.id) ? { ...n, isRead: true, readAt: now } : n)
    );
    setUnreadCount((c) => Math.max(0, c - unread.length));
  }, [location.pathname, notifications]);

  // On resize: reposition topbar panel or close if its bell becomes hidden
  useEffect(() => {
    if (!notifOpen) return;
    function onResize() {
      const wide = window.innerWidth > 1080;
      if (panelSourceRef.current === "topbar") {
        // Topbar bell is hidden at >1080px — close
        if (wide) { setNotifOpen(false); return; }
        // Still visible — recompute position to follow the bell
        const rect = mobileBellRef.current?.getBoundingClientRect();
        if (!rect) return;
        const panelWidth = 352;
        const anchorRight = Math.min(rect.right, window.innerWidth - 8);
        const left = Math.max(8, anchorRight - panelWidth);
        setPanelPos({ top: rect.bottom + 6, left, mobile: true });
      } else if (panelSourceRef.current === "sidebar") {
        // Sidebar nav bell is hidden at ≤1080px — close
        if (!wide) setNotifOpen(false);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [notifOpen]);

  // Close sidebar on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inBell = bellRef.current?.contains(target) || mobileBellRef.current?.contains(target);
      if (!inPanel && !inBell) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  // Fetch notifications and poll every 30s
  useEffect(() => {
    if (!isAuthenticated || !isReady) return;

    async function fetchNotifs() {
      try {
        const result = await apiClient.getMyNotifications(requestHeaders);
        setNotifications(result.items);
        setUnreadCount(result.unreadCount);
      } catch {
        // silently ignore
      }
    }

    void fetchNotifs();
    const interval = setInterval(() => void fetchNotifs(), 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isReady, requestHeaders]);

  function openPanel(ref: React.RefObject<HTMLButtonElement | null>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    // Use which ref was clicked, not viewport width — topbar bell always drops down,
    // sidebar nav bell always opens to the right regardless of breakpoint.
    if (ref === mobileBellRef) {
      panelSourceRef.current = "topbar";
      const panelWidth = 352; // 22rem
      const anchorRight = Math.min(rect.right, window.innerWidth - 8);
      const left = Math.max(8, anchorRight - panelWidth);
      setPanelPos({ top: rect.bottom + 6, left, mobile: true });
    } else {
      panelSourceRef.current = "sidebar";
      const sidebarEl = ref.current?.closest(".app-sidebar");
      const sidebarRight = sidebarEl?.getBoundingClientRect().right ?? rect.right;
      // Bottom-align panel to the button so it opens upward — clamped 8px from viewport bottom
      const bottom = Math.max(8, window.innerHeight - rect.bottom);
      setPanelPos({ bottom, left: sidebarRight + 4 });
    }
    setNotifOpen(true);
  }

  async function handleNotifClick(notif: NotificationRecord) {
    setNotifOpen(false);
    if (!notif.isRead) {
      try {
        await apiClient.markNotificationRead(notif.id, requestHeaders);
        setNotifications((prev) =>
          prev.map((n) => n.id === notif.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // ignore
      }
    }
    navigate(`/tickets/${notif.ticketId}`);
  }

  async function handleMarkAllRead() {
    try {
      await apiClient.markAllNotificationsRead(requestHeaders);
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? now })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  async function handleClearRead() {
    try {
      await apiClient.clearReadNotifications(requestHeaders);
      setNotifications((prev) => prev.filter((n) => !n.isRead));
    } catch {
      // ignore
    }
  }

  function formatRelativeTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  return (
    <div className="app-shell">
      {/* Overlay backdrop — only interactive on mobile when sidebar is open */}
      <div
        className={`sidebar-backdrop${sidebarOpen ? " backdrop-visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`app-sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="brand-card">
          <div className="brand-identity">
            <div className="brand-logo-frame">
              <img className="brand-logo" src={brandLogo} alt="Demo" />
            </div>
            <div className="brand-text">
              <p className="brand-org">Demo</p>
              <h1 className="brand-name">Help Desk</h1>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const [itemPath, itemQuery] = item.to.split("?") as [string, string | undefined];
            const itemParams = itemQuery ? new URLSearchParams(itemQuery) : null;
            const currentParams = new URLSearchParams(location.search);

            let isActive: boolean;
            if (itemParams) {
              // Nav item has search params — active only if pathname AND all specified params match
              isActive =
                location.pathname === itemPath &&
                [...itemParams.entries()].every(([k, v]) => currentParams.get(k) === v);
            } else {
              // Nav item has no search params — active if pathname matches AND no sibling nav item
              // with search params at the same path is currently active (it would be more specific)
              const siblingActive = navItems.some((other) => {
                if (!other.to.includes("?")) return false;
                const [otherPath, otherQuery] = other.to.split("?") as [string, string];
                if (otherPath !== itemPath) return false;
                const otherParams = new URLSearchParams(otherQuery);
                return [...otherParams.entries()].every(([k, v]) => currentParams.get(k) === v);
              });
              isActive = location.pathname === itemPath && !siblingActive;
            }

            if (item.external) {
              return (
                <a
                  key={item.to}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`nav-link${item.divided ? " nav-link-divided" : ""}`}
                >
                  <span className="nav-label">{item.label}</span>
                </a>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`nav-link${isActive ? " nav-link-active" : ""}${item.divided ? " nav-link-divided" : ""}`}
              >
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {canSwitchRole && (
            <div className="preview-role-section">
              <button
                type="button"
                className="preview-role-toggle"
                onClick={() => setPreviewOpen((o) => !o)}
              >
                <span>Preview role</span>
                <ChevronIcon open={previewOpen} />
              </button>
              {previewOpen && (
                <div className="preview-role-content">
                  <div className="role-switcher">
                    {(
                      [
                        { value: "end_user", label: "User" },
                        { value: "tech", label: "Tech" }
                      ] as const
                    ).map((option) => {
                      const isActive = isPreviewingRole && userRole === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={isActive ? "role-switch-button role-switch-button-active" : "role-switch-button"}
                          onClick={() => onRoleChange(isActive ? "admin" : option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {import.meta.env.DEV && (
                    <>
                      <p className="sidebar-meta">Auth: {authMode === "entra" ? "Entra" : "Mock"}</p>
                      <p className="sidebar-meta">Data: {useMockApi ? "Mock" : "Local API"}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {isAuthenticated && (
            <button
              ref={bellRef}
              type="button"
              className={`notif-footer-btn${notifOpen ? " notif-footer-btn-active" : ""}`}
              onClick={() => notifOpen ? setNotifOpen(false) : openPanel(bellRef)}
              aria-label="Notifications"
            >
              <span className="notif-footer-label">
                <BellIcon size={14} />
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="notif-nav-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </button>
          )}

          {notifOpen && panelPos && createPortal(
            <div
              ref={panelRef}
              className={`notif-panel${panelPos.mobile ? " notif-panel-mobile" : ""}`}
              style={{
                top: panelPos.top,
                bottom: panelPos.bottom,
                left: panelPos.left,
                right: panelPos.right,
              }}
            >
              <div className="notif-panel-header">
                <span>Notifications</span>
                <div className="notif-header-actions">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="notif-mark-all-btn"
                      onClick={() => void handleMarkAllRead()}
                    >
                      Mark all read
                    </button>
                  )}
                  {notifications.some((n) => n.isRead) && (
                    <button
                      type="button"
                      className="notif-mark-all-btn notif-clear-btn"
                      onClick={() => void handleClearRead()}
                    >
                      Clear read
                    </button>
                  )}
                </div>
              </div>
              <div className="notif-panel-list">
                {notifications.length === 0 ? (
                  <p className="notif-empty">No notifications yet.</p>
                ) : (
                  (() => {
                    const unread = notifications.filter((n) => !n.isRead);
                    const read = notifications.filter((n) => n.isRead).slice(0, 10);
                    const visible = [...unread, ...read];
                    return visible.map((notif) => (
                      <div
                        key={notif.id}
                        className={`notif-row${notif.isRead ? "" : " unread"}`}
                        onClick={() => void handleNotifClick(notif)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleNotifClick(notif); }}
                      >
                        <span className="notif-row-title">{notif.title}</span>
                        <span className="notif-row-time">{formatRelativeTime(notif.createdAt)}</span>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>,
            document.body
          )}

          <div className="identity-section" ref={identityRef}>
            {identityOpen && (
              <button
                type="button"
                className="sidebar-signout-btn"
                onClick={() => { setIdentityOpen(false); onSignOut(); }}
              >
                Sign out
              </button>
            )}
            <div className="sidebar-identity">
              <button
                type="button"
                className="identity-trigger"
                onClick={() => setIdentityOpen((o) => !o)}
                aria-label="Account menu"
              >
                <div className="identity-avatar">{initials}</div>
                <div className="identity-info">
                  <strong>{userName}</strong>
                  <span className="role-chip">{ROLE_LABELS[userRole]}</span>
                </div>
              </button>
              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              >
                {theme === "light" ? <MoonIcon /> : <SunIcon />}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        {isPreviewingRole && (
          <div className="preview-banner">
            Previewing as {ROLE_LABELS[userRole]} — read only
          </div>
        )}
        <div className="app-main-inner">
          <div className="mobile-topbar">
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <HamburgerIcon />
            </button>
            <span className="mobile-brand">Help Desk</span>
            {isAuthenticated && (
              <button
                ref={mobileBellRef}
                type="button"
                className="notif-bell-btn mobile-bell-btn"
                onClick={() => notifOpen ? setNotifOpen(false) : openPanel(mobileBellRef)}
                aria-label="Notifications"
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </button>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
