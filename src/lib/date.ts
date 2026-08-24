const WIB = "Asia/Jakarta";
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: WIB, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Today's date in Asia/Jakarta as YYYY-MM-DD. */
export function todayISO(): string {
  return fmt.format(new Date());
}
