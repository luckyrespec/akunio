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

import { PeriodDialog, DeletePeriodButton } from "@/components/settings/period-dialog";
import { Bot, Edit2 } from "lucide-react";

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
    id: "periode",
    label: "Periode Fiskal",
    description: "Kelola tahun buku & tutup periode",
    icon: Calendar,
  },
  {
    id: "agent",
    label: "Kebijakan Agent AI",
    description: "Otorisasi transaksi & otomasi Nara",
    icon: Bot,
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
    <div className="flex flex-col lg:flex-row h-full w-full min-h-[calc(100vh-3.5rem)] bg-canvas">
      {/* 1. SIDEMENU PENGATURAN (MENEMPEL / DOCKED PERSIS SEPERTI ASISTEN) */}
      <aside className="w-full lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-rule bg-paper flex flex-col">
        {/* Info Header Organisasi */}
        <div className="p-4 border-b border-rule shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-terra/10 border border-terra/25 text-terra">
              <Building2 className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-sm font-bold text-ink truncate" title={organization.name}>
                {organization.name}
              </h3>
              <p className="text-[11px] text-ink-soft">Pengaturan Ruang Kerja</p>
            </div>
          </div>
        </div>

        {/* Sidemenu Nav Items */}
        <nav className="p-2 space-y-1 flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
            Menu Pengaturan
          </div>

          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs transition-all text-left group",
                  isActive
                    ? "bg-terra/10 text-terra font-semibold border border-terra/25 shadow-2xs"
                    : "text-ink-soft hover:bg-canvas hover:text-ink border border-transparent",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive ? "text-terra" : "text-ink-soft group-hover:text-ink",
                  )}
                />
                <span className="truncate font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 2. KONTEN DETAIL PENGATURAN */}
      <main className="flex-1 w-full min-w-0 p-5 sm:p-6 lg:p-8 overflow-y-auto max-w-[1400px]">
        {/* TAB 1: BAGAN AKUN (COA) */}
        {activeTab === "coa" && (
          <CoaManager accounts={accounts} userRole={userRole} />
        )}

        {/* TAB 2: PERIODE FISKAL (CRUD LENGKAP & ICON ACTIONS) */}
        {activeTab === "periode" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-ink">Periode Fiskal Akuntansi</h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Kelola tahun buku transaksi, tambahkan periode penyesuaian (13/14), dan kunci periode yang telah ditutup.
                </p>
              </div>

              {canEdit && (
                <div className="shrink-0">
                  <PeriodDialog mode="create" />
                </div>
              )}
            </div>

            {/* Tabel Periode */}
            <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/70 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <th className="px-4 py-3">Nama Periode</th>
                      <th className="px-4 py-3">Rentang Tanggal</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60">
                    {periods.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-ink-soft">
                          <Calendar className="size-8 mx-auto mb-2 text-ink-soft/40" />
                          <p className="font-semibold text-ink">Belum ada periode fiskal</p>
                          <p className="text-[11px] mt-0.5">Klik tombol &ldquo;Tambah Periode&rdquo; untuk mendaftarkan periode baru.</p>
                        </td>
                      </tr>
                    ) : (
                      periods.map((p) => (
                        <tr key={p.id} className="hover:bg-canvas/30 transition-colors group">
                          <td className="px-4 py-3 font-semibold text-ink">
                            <div className="flex items-center gap-2">
                              <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra border border-terra/20">
                                <Calendar className="size-3.5" />
                              </div>
                              <span className="font-mono font-bold text-xs">{p.name}</span>
                              {parseInt(p.name.slice(5), 10) > 12 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10">
                                  {parseInt(p.name.slice(5), 10) === 13 ? "Periode Penyesuaian" : "Periode Audit"}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-ink-soft">
                            {p.startsOn} <span className="text-rule">•</span> {p.endsOn}
                          </td>
                          <td className="px-4 py-3">
                            {p.status === "OPEN" ? (
                              <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] gap-1 font-semibold">
                                <Unlock className="size-2.5" />
                                <span>Terbuka (Open)</span>
                              </Badge>
                            ) : p.status === "CLOSED" ? (
                              <Badge variant="secondary" className="border border-rule text-ink-soft text-[10px] gap-1">
                                <Lock className="size-2.5" />
                                <span>Ditutup (Closed)</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border border-rule text-ink-soft text-[10px] gap-1">
                                <Lock className="size-2.5" />
                                <span>Terkunci (Locked)</span>
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {canEdit && (
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Close / Reopen Icon Action */}
                                <PeriodActions periodId={p.id} status={p.status} />

                                {/* Edit Dialog Icon */}
                                <PeriodDialog
                                  mode="edit"
                                  period={p}
                                  trigger={
                                    <button
                                      type="button"
                                      title="Edit Periode"
                                      className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
                                    >
                                      <Edit2 className="size-3" />
                                    </button>
                                  }
                                />

                                {/* Delete Dialog Icon */}
                                <DeletePeriodButton periodId={p.id} periodName={p.name} />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: KEBIJAKAN AGENT AI */}
        {activeTab === "agent" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
                  <Bot className="size-5 text-terra" />
                  <span>Kebijakan Otorisasi Nara AI (Human-in-The-Loop)</span>
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Atur tingkat otonomi dan batas verifikasi sebelum Nara AI membuat draf atau memposting jurnal ke buku besar.
                </p>
              </div>
            </div>

            <HitlPolicySelector currentPolicy={organization.aiHitlPolicy ?? "smart"} />
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
