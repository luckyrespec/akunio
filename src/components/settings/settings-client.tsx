"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Layers,
  ShieldCheck,
  Users,
  Building2,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  Mail,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { CoaManager, type AccountItem } from "@/components/settings/coa-manager";
import { HitlPolicySelector } from "@/components/settings/hitl-policy-selector";
import { PeriodActions } from "@/components/settings/period-actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PeriodItem {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
}

interface MemberItem {
  email: string;
  role: "OWNER" | "ACCOUNTANT" | "VIEWER";
}

interface OrganizationInfo {
  id: string;
  name: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  aiHitlPolicy?: "smart" | "strict" | "autonomous";
}

interface SettingsClientProps {
  organization: OrganizationInfo;
  accounts: AccountItem[];
  periods: PeriodItem[];
  members: MemberItem[];
  userRole?: string;
}

const TABS = [
  {
    id: "coa",
    label: "Bagan Akun (COA)",
    description: "Struktur hierarki akun & saldo normal",
    icon: Layers,
  },
  {
    id: "kebijakan",
    label: "Kebijakan & Periode",
    description: "Otorisasi transaksi AI & tutup buku",
    icon: ShieldCheck,
  },
  {
    id: "anggota",
    label: "Anggota Tim",
    description: "Akses & peran anggota organisasi",
    icon: Users,
  },
  {
    id: "organisasi",
    label: "Profil Organisasi",
    description: "Identitas ruang kerja & mata uang",
    icon: Building2,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsClient({
  organization,
  accounts,
  periods,
  members,
  userRole,
}: SettingsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") as TabId | null;
  const activeTab: TabId = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "coa";

  const handleSelectTab = (tabId: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const openPeriodsCount = periods.filter((p) => p.status === "OPEN").length;
  const canEdit = userRole !== "VIEWER";

  return (
    <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-8 min-h-[600px]">
      {/* 1. SIDEMENU PENGATURAN */}
      <aside className="w-full lg:w-72 shrink-0 space-y-4">
        {/* Info Box Organisasi */}
        <div className="rounded-2xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-terra/10 border border-terra/25 text-terra">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-sm font-bold text-ink truncate" title={organization.name}>
                {organization.name}
              </h3>
              <p className="text-[11px] text-ink-soft">Ruang Kerja Akuntansi</p>
            </div>
          </div>
        </div>

        {/* Sidemenu Nav Items */}
        <nav className="rounded-2xl border border-rule bg-paper p-2 shadow-2xs space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
            Menu Pengaturan
          </div>

          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            let badgeText = "";
            if (tab.id === "coa") badgeText = `${accounts.length}`;
            if (tab.id === "kebijakan") badgeText = `${openPeriodsCount} Aktif`;
            if (tab.id === "anggota") badgeText = `${members.length}`;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-all text-left group",
                  isActive
                    ? "bg-terra/10 text-terra font-semibold border border-terra/30 shadow-2xs"
                    : "text-ink hover:bg-canvas text-ink-soft hover:text-ink border border-transparent",
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      isActive ? "text-terra" : "text-ink-soft group-hover:text-ink",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate leading-tight">{tab.label}</p>
                    <p className={cn("text-[10px] truncate mt-0.5", isActive ? "text-terra/80" : "text-ink-soft")}>
                      {tab.description}
                    </p>
                  </div>
                </div>

                {badgeText && (
                  <span
                    className={cn(
                      "ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-mono border",
                      isActive
                        ? "bg-paper text-terra border-terra/30 font-bold"
                        : "bg-canvas text-ink-soft border-rule",
                    )}
                  >
                    {badgeText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 2. KONTEN DETAIL PENGATURAN */}
      <main className="flex-1 w-full min-w-0">
        {/* TAB 1: BAGAN AKUN (COA) */}
        {activeTab === "coa" && (
          <CoaManager accounts={accounts} userRole={userRole} />
        )}

        {/* TAB 2: KEBIJAKAN & PERIODE */}
        {activeTab === "kebijakan" && (
          <div className="space-y-8 animate-in fade-in-50 duration-200">
            {/* Bagian Kebijakan Persetujuan AI */}
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-base font-bold text-ink">
                  Kebijakan Persetujuan Transaksi AI (Human-in-The-Loop)
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Tentukan tingkat otonomi Nara AI saat membuat dan memposting jurnal transaksi.
                </p>
              </div>

              <HitlPolicySelector currentPolicy={organization.aiHitlPolicy ?? "smart"} />
            </div>

            {/* Bagian Periode Akuntansi */}
            <div className="space-y-4 pt-4 border-t border-rule">
              <div>
                <h2 className="font-display text-base font-bold text-ink">Periode Fiskal Akuntansi</h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Periode yang ditutup (Closed) atau dikunci (Locked) menolak pencatatan transaksi jurnal baru demi integritas audit.
                </p>
              </div>

              {/* Tabel Periode */}
              <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/70 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <th className="px-4 py-3">Nama Periode</th>
                      <th className="px-4 py-3">Rentang Tanggal</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Aksi Otoritas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60">
                    {periods.map((p) => (
                      <tr key={p.id} className="hover:bg-canvas/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-ink flex items-center gap-2">
                          <Calendar className="size-3.5 text-terra" />
                          <span>{p.name}</span>
                        </td>
                        <td className="px-4 py-3 text-ink-soft">
                          {p.startsOn} s/d {p.endsOn}
                        </td>
                        <td className="px-4 py-3">
                          {p.status === "OPEN" ? (
                            <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] gap-1">
                              <Unlock className="size-2.5" />
                              <span>Terbuka (Open)</span>
                            </Badge>
                          ) : p.status === "CLOSED" ? (
                            <Badge variant="secondary" className="border-rule text-ink-soft text-[10px] gap-1">
                              <Lock className="size-2.5" />
                              <span>Ditutup (Closed)</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-rule text-ink-soft text-[10px] gap-1">
                              <Lock className="size-2.5" />
                              <span>Terkunci (Locked)</span>
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {canEdit && <PeriodActions periodId={p.id} status={p.status} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ANGGOTA TIM */}
        {activeTab === "anggota" && (
          <div className="space-y-4 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-ink">Anggota Organisasi</h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Daftar pengguna terdaftar yang memiliki hak akses pada ruang kerja ini.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs text-ink-soft">
                {members.length} Pengguna
              </Badge>
            </div>

            <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs divide-y divide-rule/60">
              {members.map((m) => {
                const initial = m.email.charAt(0).toUpperCase();
                return (
                  <div key={m.email} className="flex items-center justify-between p-4 hover:bg-canvas/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas border border-rule font-bold text-sm text-ink">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs text-ink truncate">{m.email}</p>
                        <p className="text-[10px] text-ink-soft mt-0.5 flex items-center gap-1">
                          <Mail className="size-3 text-ink-soft" />
                          <span>Terverifikasi</span>
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono px-2.5 py-0.5",
                        m.role === "OWNER"
                          ? "border-terra/40 text-terra bg-terra/10 font-bold"
                          : m.role === "ACCOUNTANT"
                          ? "border-blue-500/30 text-blue-700 bg-blue-50/50"
                          : "border-rule text-ink-soft bg-canvas",
                      )}
                    >
                      {m.role}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: PROFIL ORGANISASI */}
        {activeTab === "organisasi" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div>
              <h2 className="font-display text-base font-bold text-ink">Profil Organisasi</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Informasi entitas bisnis dan parameter pembukuan standar.
              </p>
            </div>

            <div className="rounded-2xl border border-rule bg-paper p-6 shadow-2xs space-y-4 max-w-xl">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-ink-soft block text-[11px]">Nama Perusahaan / Entitas</span>
                  <span className="font-semibold text-ink text-sm mt-0.5 block">{organization.name}</span>
                </div>
                <div>
                  <span className="text-ink-soft block text-[11px]">Mata Uang Pelaporan</span>
                  <span className="font-semibold text-ink text-sm mt-0.5 block">{organization.baseCurrency} (Rupiah)</span>
                </div>
                <div>
                  <span className="text-ink-soft block text-[11px]">Awal Tahun Fiskal</span>
                  <span className="font-semibold text-ink text-sm mt-0.5 block">
                    Bulan ke-{organization.fiscalYearStartMonth} (Januari)
                  </span>
                </div>
                <div>
                  <span className="text-ink-soft block text-[11px]">Standar Akuntansi Kepatuhan</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5 block">
                    SAK EMKM / IFRS for SMEs
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-rule/60 text-[11px] text-ink-soft">
                <span className="font-mono text-[10px] text-ink-soft">ID Organisasi: {organization.id}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
