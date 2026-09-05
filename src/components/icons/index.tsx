import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export type IconProps = SVGProps<SVGSVGElement>;

function createIcon(svgPath: (props: IconProps) => React.ReactNode) {
  return function Icon({ className, ...props }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("size-4 shrink-0", className)}
        {...props}
      >
        {svgPath(props)}
      </svg>
    );
  };
}

// Navigation & Accounting Core Icons
export const IconDashboard = createIcon(() => (
  <>
    <path d="M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1m0 12h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1m10-4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1m0-8h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1" />
  </>
));

export const IconReceipt = createIcon(() => (
  <>
    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2l-2 2l-2-2l-2 2l-2-2zM9 7h6m-6 4h6m-2 4h2" />
  </>
));

export const IconTax = createIcon(() => (
  <>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M15 9.5 9 15.5" />
    <circle cx="9.5" cy="10" r=".75" fill="currentColor" />
    <circle cx="14.5" cy="15" r=".75" fill="currentColor" />
  </>
));

export const IconInventory = createIcon(() => (
  <>
    <path d="m7 16.5-5-3 5-3 5 3V19l-5 3z" />
    <path d="M2 13.5V19l5 3m0-5.455l5-3.03m5 2.985-5-3 5-3 5 3V19l-5 3zM12 19l5 3m0-5.5l5-3m-10 0V8L7 5l5-3l5 3v5.5M7 5.03v5.455M12 8l5-3" />
  </>
));

export const IconReconciliation = createIcon(() => (
  <>
    <path d="M21 17H3m3-7L3 7l3-3M3 7h18m-3 13l3-3l-3-3" />
  </>
));

export const IconContacts = createIcon(() => (
  <>
    <path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-17.87a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" />
  </>
));

export const IconJournal = createIcon(() => (
  <>
    <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6v13m9-13v13m9-13v13" />
  </>
));

export const IconLedger = createIcon(() => (
  <>
    <path d="M3 21h18M3 10h18M5 6l7-3l7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" />
  </>
));

export const IconAssets = createIcon(() => (
  <>
    <path d="M3 21h18M5 21V7l8-4v18m6 0V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
  </>
));

export const IconReports = createIcon(() => (
  <>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2m-8-4v-5m3 5v-1m3 1v-3" />
  </>
));

export const IconClosing = createIcon(() => (
  <>
    <path d="M11.795 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
    <path d="M14 18a4 4 0 1 0 8 0a4 4 0 1 0-8 0m1-15v4M7 3v4m-4 4h16" />
    <path d="M18 16.496V18l1 1" />
  </>
));

export const IconDoctor = createIcon(() => (
  <>
    <path d="M6 4H5a2 2 0 0 0-2 2v3.5a5.5 5.5 0 0 0 11 0V6a2 2 0 0 0-2-2h-1" />
    <path d="M8 15a6 6 0 1 0 12 0v-3m-9-9v2M6 3v2" />
    <path d="M18 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />
  </>
));

export const IconSettings = createIcon(() => (
  <>
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065" />
    <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0" />
  </>
));

export const IconClose = createIcon(() => (
  <>
    <path d="M18 6L6 18M6 6l12 12" />
  </>
));

export const IconSearch = createIcon(() => (
  <>
    <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6" />
  </>
));

export const IconSparkles = createIcon(() => (
  <>
    <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2m0-12a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2M9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6" />
  </>
));

export const IconArrowRight = createIcon(() => (
  <>
    <path d="M5 12h14m-6 6l6-6m-6-6l6 6" />
  </>
));

export const IconCheck = createIcon(() => (
  <>
    <path d="m5 12l5 5L20 7" />
  </>
));

export const IconCircleCheck = createIcon(() => (
  <>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0" />
    <path d="m9 12l2 2l4-4" />
  </>
));

export const IconAlertTriangle = createIcon(() => (
  <>
    <path d="M12 9v4m-1.637-9.409L2.257 17.125a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87L13.637 3.59a1.914 1.914 0 0 0-3.274 0M12 16h.01" />
  </>
));

export const IconRefresh = createIcon(() => (
  <>
    <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </>
));

export const IconPaperclip = createIcon(() => (
  <>
    <path d="m15 7-6.5 6.5a1.5 1.5 0 0 0 3 3L18 10a3 3 0 0 0-6-6l-6.5 6.5a4.5 4.5 0 0 0 9 9L21 13" />
  </>
));

export const IconLock = createIcon(() => (
  <>
    <path d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V7a4 4 0 1 1 8 0v4" />
  </>
));

export const IconLockOpen = createIcon(() => (
  <>
    <path d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V6a4 4 0 0 1 8 0" />
  </>
));

export const IconShieldCheck = createIcon(() => (
  <>
    <path d="M11.46 20.846A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-.09 7.06M15 19l2 2l4-4" />
  </>
));

export const IconBolt = createIcon(() => (
  <>
    <path d="M13 3v7h6l-8 11v-7H5z" />
  </>
));

export const IconSun = createIcon(() => (
  <>
    <path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0m-5 0h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7" />
  </>
));

export const IconMoon = createIcon(() => (
  <>
    <path d="M12 3h.393a7.5 7.5 0 0 0 7.92 12.446A9 9 0 1 1 12 2.992z" />
  </>
));

export const IconDesktop = createIcon(() => (
  <>
    <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm4 15h10m-8-4v4m6-4v4" />
  </>
));

export const IconClock = createIcon(() => (
  <>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
    <path d="M12 7v5l3 3" />
  </>
));

export const IconPrinter = createIcon(() => (
  <>
    <path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2m10-8V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4" />
    <path d="M7 15a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
  </>
));

export const IconFileSpreadsheet = createIcon(() => (
  <>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2" />
    <path d="M8 11h8M8 15h8M11 11v8" />
  </>
));

export const IconFileWarning = createIcon(() => (
  <>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2" />
    <path d="M12 11v4M12 18h.01" />
  </>
));

export const IconFlame = createIcon(() => (
  <>
    <path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z" />
  </>
));

export const IconInfo = createIcon(() => (
  <>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
    <path d="M12 9h.01M11 12h1v4h1" />
  </>
));

export const IconLayers = createIcon(() => (
  <>
    <path d="m12 2 8 4-8 4-8-4 8-4z" />
    <path d="m4 10 8 4 8-4M4 14l8 4 8-4M4 18l8 4 8-4" />
  </>
));

export const IconScale = createIcon(() => (
  <>
    <path d="M16 16c0 3.314-1.79 6-4 6s-4-2.686-4-6M12 3v19M4 7l4 2 4-2M12 7l4 2 4-2" />
    <path d="M2 13a4 4 0 0 0 8 0M14 13a4 4 0 0 0 8 0" />
  </>
));

export const IconShieldAlert = createIcon(() => (
  <>
    <path d="M11.46 20.846A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-.09 7.06" />
    <path d="M12 8v4M12 16h.01" />
  </>
));

export const IconLayoutSidebar = createIcon(() => (
  <>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm5-2v16" />
  </>
));

export const IconSelector = createIcon(() => (
  <>
    <path d="m8 9l4-4l4 4m0 6l-4 4l-4-4" />
  </>
));

export const IconLogout = createIcon(() => (
  <>
    <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
    <path d="M9 12h12l-3-3m0 6l3-3" />
  </>
));

export const IconBookOpen = createIcon(() => (
  <>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </>
));


