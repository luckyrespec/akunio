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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  // Avoid flash of wrong width before localStorage read
  if (!ready) {
    return (
      <div className="flex min-h-screen w-full">
        <SidebarNav collapsed={false} />
        <div className="flex min-h-0 flex-1 flex-col">
          <Topbar onToggleSidebar={toggle} />
          <main className="flex-1 px-(--gutter) py-(--gutter) lg:px-(--gutter-lg)">{children}</main>
        </div>
        <AssistantWidget />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
      <SidebarNav collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar onToggleSidebar={toggle} />
        <main className="flex-1 px-(--gutter) py-(--gutter) lg:px-(--gutter-lg)">
          <PageTransition key={pathname}>{children}</PageTransition>
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
}
