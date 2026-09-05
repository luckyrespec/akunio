"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { IconDesktop, IconMoon, IconSun } from "@/components/icons";
import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;

const META: Record<(typeof ORDER)[number], { label: string; Icon: typeof IconSun }> = {
  system: { label: "Sistem", Icon: IconDesktop },
  light: { label: "Terang", Icon: IconSun },
  dark: { label: "Gelap", Icon: IconMoon },
};

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  function cycle() {
    const current = mounted && theme ? theme : "system";
    const idx = ORDER.indexOf(current as (typeof ORDER)[number]);
    setTheme(ORDER[(idx + 1) % ORDER.length]);
  }

  const effective = (mounted && theme ? theme : "system") as (typeof ORDER)[number];
  const { label, Icon } = META[effective];

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycle}
      className="justify-start text-ink-soft hover:text-ink"
      title={`Tema: ${label} — klik untuk mengganti`}
      aria-label={`Tema saat ini ${label}, klik untuk mengganti`}
    >
      <Icon className="size-4" />
      <span className="text-sm">{label}</span>
    </Button>
  );
}
