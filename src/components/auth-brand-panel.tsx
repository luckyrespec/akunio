"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Lock, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentType, SVGProps } from "react";
import { AkunioLogoLockup } from "@/components/brand/akunio-logo";

const EASE = [0.22, 1, 0.36, 1] as const;

type Mode = "masuk" | "daftar";

function BaseIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

// Set ikon strip: satu bahasa goresan (grid 24, round caps) dari mekanisme
// produk — chat agen, buku SAK, awan, kemudahan awam, jurnal terkunci.
function AgentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 5.5h16v9.5H9.5L4 19.5v-14Z" />
      <path d="M12 7.4l.85 1.85 2.05.3-1.5 1.45.35 2.05-1.75-.95-1.75.95.35-2.05-1.5-1.45 2.05-.3.85-1.85Z" />
    </BaseIcon>
  );
}

function LedgerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V2.8h6V4" />
      <path d="M9.4 13.6l2.4 2.4 4.4-4.8" />
    </BaseIcon>
  );
}

function CloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M7 18.5a4 4 0 1 1 .7-7.93A5.5 5.5 0 0 1 18.2 12H18a3 3 0 0 1 0 6.5H7Z" />
      <path d="M9.6 13.6l1.9 1.9 3.3-3.8" />
    </BaseIcon>
  );
}

function EaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M12 6.5C10 5 7 4.5 4 4.5v13c3 0 6 .5 8 2 2-1.5 5-2 8-2v-13c-3 0-6 .5-8 2Z" />
      <path d="M12 6.5v13" />
      <path d="M18.6 2.4l.65 1.5 1.5.65-1.5.65-.65 1.5-.65-1.5-1.5-.65 1.5-.65.65-1.5Z" />
    </BaseIcon>
  );
}

function LockedLedgerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </BaseIcon>
  );
}

const FEATURES: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }[] = [
  { icon: AgentIcon, label: "Asisten Pembukuan" },
  { icon: LedgerIcon, label: "SAK EMKM" },
  { icon: CloudIcon, label: "Data Aman" },
  { icon: EaseIcon, label: "Awam Pun Bisa" },
  { icon: LockedLedgerIcon, label: "Jurnal Terkunci" },
];

// Playlist contoh yang berputar di panel kiri. "daftar" mendarat di
// onboarding (pengunjung baru melihat aplikasi ini apa), "masuk" mendarat
// di pengeluaran (pengguna kembali melihat keajaiban harian).
const ORDER = ["expense", "asset", "invoice", "onboarding"] as const;
type ExampleId = (typeof ORDER)[number];
const HOME: Record<Mode, ExampleId> = { daftar: "onboarding", masuk: "expense" };

const STEPS: Record<ExampleId, number[]> = {
  expense: [1300, 1100, 1000, 2300, 1700, 2500],
  asset: [1300, 2200, 1700, 2400],
  invoice: [1300, 2200, 1700, 2400],
  onboarding: [1400, 1200, 2000, 2200, 2400],
};
const HOLD_MS = 2600;

function usePlaylist(mode: Mode, active: boolean, reduce: boolean) {
  // Contoh awal mengikuti halaman pertama yang dibuka; setelah itu playlist
  // jalan terus — pindah masuk/daftar tidak me-reset maupun mengganti contoh.
  const homeOnce = useRef<ExampleId>(HOME[mode]);
  const [ex, setEx] = useState<ExampleId>(homeOnce.current);
  const [phase, setPhase] = useState(reduce ? 999 : 0);

  useEffect(() => {
    if (reduce) {
      setPhase(999);
      return;
    }
    if (!active) return;
    const max = STEPS[ex].length;
    if (phase >= max) {
      const t = setTimeout(() => {
        setEx(ORDER[(ORDER.indexOf(ex) + 1) % ORDER.length]);
        setPhase(0);
      }, HOLD_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase((p) => p + 1), STEPS[ex][phase]);
    return () => clearTimeout(t);
  }, [ex, phase, active, reduce]);

  return { ex, phase: reduce ? 999 : phase };
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.15,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

function Appear({
  children,
  delay = 0,
  className,
  reduce,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  reduce: boolean;
}) {
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-terra px-4 py-2.5 text-sm leading-relaxed text-white shadow-xs">
        {children}
      </div>
    </div>
  );
}

function NaraBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm leading-relaxed text-ink shadow-xs">
        {children}
      </div>
    </div>
  );
}

function ThinkingDots({ reduce }: { reduce: boolean }) {
  return (
    <div className="flex justify-start" aria-hidden>
      <div className="flex gap-1.5 rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-3 shadow-xs">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-ink-soft"
            {...(reduce
              ? {}
              : {
                  animate: { opacity: [0.3, 1, 0.3] },
                  transition: { duration: 1, repeat: Infinity, delay: i * 0.2 },
                })}
          />
        ))}
      </div>
    </div>
  );
}

function DraftCard({
  doc,
  rows,
  reduce,
}: {
  doc: string;
  rows: { account: string; amount: string; side: string; sideClass: string }[];
  reduce: boolean;
}) {
  return (
    <div className="rounded-xl border border-rule bg-paper p-4 text-ink shadow-xs">
      <div className="flex items-center justify-between">
        <span className="rounded-md border border-rule px-2 py-0.5 text-[11px] font-medium tracking-widest uppercase text-ink-soft">
          Draf
        </span>
        <span className="tnum text-xs font-medium text-ink-soft">{doc}</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row, i) => (
          <Appear key={row.account} delay={0.15 + i * 0.25} reduce={reduce}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium">{row.account}</span>
              <span className="tnum">
                {row.amount}{" "}
                <span className={cn("ml-1 text-xs font-semibold", row.sideClass)}>{row.side}</span>
              </span>
            </div>
          </Appear>
        ))}
      </div>
    </div>
  );
}

function ApproveRow({ primary, reduce }: { primary: string; reduce: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <span className="rounded-lg border border-paper/30 px-3.5 py-1.5 text-sm font-medium text-paper/80">
        Ubah
      </span>
      <motion.span
        className="rounded-lg bg-terra px-3.5 py-1.5 text-sm font-semibold text-white"
        {...(reduce
          ? {}
          : {
              animate: { scale: [1, 1.06, 1] },
              transition: { duration: 0.9, ease: "easeOut" },
            })}
      >
        {primary}
      </motion.span>
    </div>
  );
}

function Stamp({
  icon: Icon,
  text,
  reduce,
}: {
  icon: typeof Lock;
  text: string;
  reduce: boolean;
}) {
  return (
    <motion.p
      className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase text-paper/70"
      {...(reduce
        ? {}
        : {
            animate: { opacity: [1, 0.6, 1] },
            transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
          })}
    >
      <Icon className="size-3.5" strokeWidth={2.5} />
      {text}
    </motion.p>
  );
}

function ExpenseScene({ phase, reduce }: { phase: number; reduce: boolean }) {
  return (
    <>
      {phase >= 1 && (
        <Appear reduce={reduce}>
          <UserBubble>Catat pengeluaran ATK Rp150.000 kemarin</UserBubble>
        </Appear>
      )}
      {phase >= 2 && (
        <Appear reduce={reduce}>
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-paper/40 bg-paper/10 px-3 py-2 text-xs text-paper">
              <ReceiptText className="size-4" strokeWidth={2} />
              nota-atk.jpg · terlampir
            </div>
          </div>
        </Appear>
      )}
      {phase === 3 && !reduce && <ThinkingDots reduce={reduce} />}
      {phase >= 4 && (
        <>
          <Appear reduce={reduce}>
            <NaraBubble>Draf seimbang sudah siap. Cek akunnya sebelum posting ya.</NaraBubble>
          </Appear>
          <Appear reduce={reduce}>
            <DraftCard
              doc="JE-2026-0001"
              rows={[
                { account: "Beban ATK", amount: "150.000", side: "Debit", sideClass: "text-debit" },
                { account: "Kas", amount: "150.000", side: "Kredit", sideClass: "text-credit" },
              ]}
              reduce={reduce}
            />
          </Appear>
        </>
      )}
      {phase >= 5 && (
        <Appear reduce={reduce}>
          <ApproveRow primary="Setujui & Posting" reduce={reduce} />
        </Appear>
      )}
      {phase >= 6 && (
        <Appear reduce={reduce}>
          <Stamp icon={Lock} text="Posted · JE-2026-0001 · Terkunci" reduce={reduce} />
        </Appear>
      )}
    </>
  );
}

function AssetScene({ phase, reduce }: { phase: number; reduce: boolean }) {
  return (
    <>
      {phase >= 1 && (
        <Appear reduce={reduce}>
          <UserBubble>Catat beli laptop Rp12.500.000 sebagai aset tetap</UserBubble>
        </Appear>
      )}
      {phase >= 2 && (
        <>
          <Appear reduce={reduce}>
            <NaraBubble>Masuk ke akun Peralatan. Draf seimbang sudah siap, cek sebelum posting ya.</NaraBubble>
          </Appear>
          <Appear reduce={reduce}>
            <DraftCard
              doc="JE-2026-0002"
              rows={[
                { account: "Peralatan", amount: "12.500.000", side: "Debit", sideClass: "text-debit" },
                { account: "Kas", amount: "12.500.000", side: "Kredit", sideClass: "text-credit" },
              ]}
              reduce={reduce}
            />
          </Appear>
        </>
      )}
      {phase >= 3 && (
        <Appear reduce={reduce}>
          <ApproveRow primary="Setujui & Posting" reduce={reduce} />
        </Appear>
      )}
      {phase >= 4 && (
        <Appear reduce={reduce}>
          <Stamp icon={Lock} text="Posted · JE-2026-0002 · Terkunci" reduce={reduce} />
        </Appear>
      )}
    </>
  );
}

function InvoiceScene({ phase, reduce }: { phase: number; reduce: boolean }) {
  return (
    <>
      {phase >= 1 && (
        <Appear reduce={reduce}>
          <UserBubble>Buatkan faktur Rp3.200.000 untuk Toko Jaya, tempo 14 hari</UserBubble>
        </Appear>
      )}
      {phase >= 2 && (
        <>
          <Appear reduce={reduce}>
            <NaraBubble>Draf faktur siap. Cek nominal dan tempo ya.</NaraBubble>
          </Appear>
          <Appear reduce={reduce}>
            <div className="rounded-xl border border-rule bg-paper p-4 text-ink shadow-xs">
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-rule px-2 py-0.5 text-[11px] font-medium tracking-widest uppercase text-ink-soft">
                  Faktur
                </span>
                <span className="tnum text-xs font-medium text-ink-soft">INV-2026-0031</span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">Toko Jaya</span>
                  <span className="tnum">3.200.000</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-ink-soft">Jatuh tempo</span>
                  <span className="font-medium">14 hari</span>
                </div>
              </div>
            </div>
          </Appear>
        </>
      )}
      {phase >= 3 && (
        <Appear reduce={reduce}>
          <ApproveRow primary="Kirim faktur" reduce={reduce} />
        </Appear>
      )}
      {phase >= 4 && (
        <Appear reduce={reduce}>
          <Stamp icon={CheckCircle2} text="Faktur terkirim" reduce={reduce} />
        </Appear>
      )}
    </>
  );
}

function OnboardingScene({ phase, reduce }: { phase: number; reduce: boolean }) {
  const rows = ["Kas", "Persediaan", "Pendapatan usaha"];
  return (
    <>
      {phase >= 1 && (
        <Appear reduce={reduce}>
          <NaraBubble>Halo! Saya Akunio, asisten pembukuan Anda. Siapa nama usaha Anda?</NaraBubble>
        </Appear>
      )}
      {phase >= 2 && (
        <Appear reduce={reduce}>
          <UserBubble>Warung Barokah</UserBubble>
        </Appear>
      )}
      {phase >= 3 && (
        <Appear reduce={reduce}>
          <NaraBubble>Siap. Bagan akun SAK EMKM untuk Warung Barokah sudah saya susun.</NaraBubble>
        </Appear>
      )}
      {phase >= 4 && (
        <Appear reduce={reduce}>
          <div className="rounded-xl border border-rule bg-paper p-4 text-ink shadow-xs">
            <p className="text-[11px] font-medium tracking-widest uppercase text-ink-soft">
              Bagan akun · SAK EMKM
            </p>
            <div className="mt-3 space-y-2">
              {rows.map((name, i) => (
                <Appear key={name} delay={0.15 + i * 0.2} reduce={reduce}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium">{name}</span>
                    <CheckCircle2 className="size-4 text-debit" strokeWidth={2} />
                  </div>
                </Appear>
              ))}
              <p className="pt-1 text-xs text-ink-soft">+ 27 akun lain disiapkan otomatis</p>
            </div>
          </div>
        </Appear>
      )}
      {phase >= 5 && (
        <Appear reduce={reduce}>
          <Stamp icon={CheckCircle2} text="Siap dipakai" reduce={reduce} />
        </Appear>
      )}
    </>
  );
}

export function AuthBrandPanel({ mode }: { mode: Mode }) {
  const reduce = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const { ex, phase } = usePlaylist(mode, inView, !!reduce);

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay, ease: EASE },
        };

  return (
    <div className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-8 xl:px-10">
      <motion.div {...enter(0.02)} className="mb-6">
        <AkunioLogoLockup markClassName="size-10 shadow-sm" showTagline />
      </motion.div>

      <motion.h1
        {...enter(0.05)}
        className="font-display text-4xl leading-[1.05] tracking-tight text-balance xl:text-5xl"
      >
        Pembukuan beres sebelum sempat menumpuk.
      </motion.h1>

      <motion.div {...enter(0.2)} className="mt-6">
        <p className="sr-only">
          Simulasi bergilir: pencatatan pengeluaran lewat chat, pembelian aset
          tetap, pembuatan faktur, dan kenalan dengan Akunio hingga bagan akun
          siap dipakai.
        </p>
        <div ref={ref} aria-hidden className="flex min-h-[300px] flex-col justify-end gap-2.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={ex}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex flex-col gap-2.5"
            >
              {ex === "expense" && <ExpenseScene phase={phase} reduce={!!reduce} />}
              {ex === "asset" && <AssetScene phase={phase} reduce={!!reduce} />}
              {ex === "invoice" && <InvoiceScene phase={phase} reduce={!!reduce} />}
              {ex === "onboarding" && <OnboardingScene phase={phase} reduce={!!reduce} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="sticky bottom-0 -mx-6 mt-auto px-6 pt-5 pb-6 xl:-mx-10 xl:px-10">
        <motion.div
          aria-hidden
          {...(reduce
            ? {}
            : {
                initial: { scaleX: 0 },
                animate: { scaleX: 1 },
                transition: { duration: 0.6, delay: 0.55, ease: EASE },
              })}
          className="mb-5 h-0.5 origin-left rounded-full bg-terra"
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5 sm:divide-x sm:divide-paper/15">
          {FEATURES.map((item, i) => (
            <motion.div
              key={item.label}
              {...(reduce
                ? {}
                : {
                    initial: { opacity: 0, y: 10 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.4, delay: 0.6 + i * 0.05, ease: EASE },
                  })}
              className="flex flex-col gap-2.5 sm:pl-4 sm:first:pl-0"
            >
              <item.icon className="size-6 text-terra" />
              <span className="flex min-h-8 items-start text-[11px] leading-snug font-semibold tracking-widest uppercase text-paper/85">
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
