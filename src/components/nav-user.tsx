"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import {
  IconDesktop,
  IconLogout,
  IconMoon,
  IconSelector,
  IconSettings,
  IconSun,
} from "@/components/icons";
import { authClient } from "@/server/auth/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const THEME_ORDER = ["system", "light", "dark"] as const;

const THEME_META: Record<(typeof THEME_ORDER)[number], { label: string; Icon: typeof IconSun }> = {
  system: { label: "Sistem", Icon: IconDesktop },
  light: { label: "Terang", Icon: IconSun },
  dark: { label: "Gelap", Icon: IconMoon },
};

function initialOf(name: string | null, email: string | null) {
  const base = (name ?? "").trim() || (email ?? "").trim();
  return base ? base.charAt(0).toUpperCase() : "?";
}

export function NavUser({
  collapsed = false,
  align = "start",
}: {
  collapsed?: boolean;
  align?: "start" | "end";
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [name, setName] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
    let alive = true;
    authClient
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setName(data?.user?.name ?? null);
        setEmail(data?.user?.email ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function keluar() {
    await authClient.signOut();
    window.location.href = "/masuk";
  }

  const displayName = name ?? (email ? email.split("@")[0] : "Pengguna");
  const effectiveTheme = (
    mounted && theme ? theme : "system"
  ) as (typeof THEME_ORDER)[number];
  const { label: themeLabel, Icon: ThemeIcon } = THEME_META[effectiveTheme];

  function cycleTheme() {
    const idx = THEME_ORDER.indexOf(effectiveTheme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={collapsed ? displayName : undefined}
          aria-label={`Menu pengguna ${displayName}`}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-rule hover:bg-canvas/70 focus-ring",
            collapsed && "justify-center px-0",
          )}
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-terra text-sm font-bold text-white"
          >
            {initialOf(name, email)}
          </span>
          {!collapsed && (
            <>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-xs font-semibold text-ink">{displayName}</span>
                {email && (
                  <span className="truncate text-[11px] text-ink-soft">{email}</span>
                )}
              </span>
              <IconSelector className="size-4 shrink-0 text-ink-soft" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align={align}
        sideOffset={12}
        className="w-60 border-rule bg-paper text-ink"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-terra text-sm font-bold text-white"
            >
              {initialOf(name, email)}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-xs font-semibold text-ink">{displayName}</span>
              {email && (
                <span className="truncate text-[11px] text-ink-soft">{email}</span>
              )}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="text-xs focus:text-ink">
            <Link href="/pengaturan" className="flex w-full items-center gap-2">
              <IconSettings className="size-3.5 text-ink-soft" />
              Pengaturan
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              cycleTheme();
            }}
            className="flex items-center gap-2 overflow-hidden text-xs focus:text-ink"
          >
            <span className="relative flex size-3.5 shrink-0 items-center justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={effectiveTheme}
                  initial={{ opacity: 0, y: 6, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <ThemeIcon className="size-3.5 text-ink-soft" />
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="relative grid flex-1 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={effectiveTheme}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {themeLabel}
                </motion.span>
              </AnimatePresence>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void keluar();
          }}
          className="flex items-center gap-2 text-xs text-destructive focus:text-destructive"
        >
          <IconLogout className="size-3.5" />
          Keluar dari Sesi
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
