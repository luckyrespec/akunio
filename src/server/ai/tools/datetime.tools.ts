import type { ToolDefinition, ToolHandler } from "./types";

const TIMEZONE = "Asia/Jakarta";

function jakartaToday(): { y: number; m: number; d: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 1);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export const datetimeToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "get_server_time",
    description:
      "Tanggal server pasti (Asia/Jakarta). PANGGIL DULU bila jawaban butuh tanggal: jatuh tempo, tanggal transaksi/opname, atau hitungan tanggal relatif (akhir bulan ini, minggu depan, kemarin). Jangan tebak tanggal dari ingatan.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export const datetimeHandlers: Record<string, ToolHandler> = {
  get_server_time: async () => {
    const { y, m, d, weekday } = jakartaToday();
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return {
      success: true,
      data: {
        todayISO: iso,
        weekday,
        timezone: TIMEZONE,
        yearMonth: `${y}-${pad(m)}`,
        monthEndISO: `${y}-${pad(m)}-${pad(lastDay)}`,
        hint: "Hitung semua tanggal relatif dari todayISO (mis. akhir bulan ini = monthEndISO).",
      },
    };
  },
};
