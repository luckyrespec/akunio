"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { PageTransition } from "@/components/motion";
import { AssistantWidget } from "@/components/assistant-widget";

const STORAGE_KEY = "neraca:sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
    setReady(true);
  }, []);

  // Close mobile drawer on route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const isAsisten = pathname.startsWith("/asisten");

  // Avoid flash of wrong width before localStorage read
  if (!ready) {
    return (
      <div className="flex min-h-screen w-full bg-canvas">
        <SidebarNav
          collapsed={false}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
          <Topbar
            onToggleSidebar={toggle}
            onOpenMobile={() => setMobileMenuOpen(true)}
          />
          <main
            className={
              isAsisten
                ? "flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden p-0 m-0 max-w-none"
                : "flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
            }
          >
            {children}
          </main>
        </div>
        {!isAsisten && <AssistantWidget />}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <SidebarNav
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
        <Topbar
          onToggleSidebar={toggle}
          onOpenMobile={() => setMobileMenuOpen(true)}
        />
        <main
          className={
            isAsisten
              ? "flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden p-0 m-0 max-w-none"
              : "flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
          }
        >
          <PageTransition key={pathname}>{children}</PageTransition>
        </main>
      </div>
      {!isAsisten && <AssistantWidget />}
    </div>
  );
}
