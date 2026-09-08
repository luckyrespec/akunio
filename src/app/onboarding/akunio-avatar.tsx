"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import type { StageStatus } from "./akunio-stage";

/**
 * Akunio hidup — mark ledger-A (terra squircle + garis buku + simpul
 * seimbang) yang diantropomorfkan: mata berkedip, pupil melihat sekeliling,
 * mulut mengikuti status, simpul emerald berdenyut seperti jantung.
 * Semua gerak hanya transform/opacity pada SVG.
 */
export function AkunioAvatar({ status }: { status: StageStatus }) {
  const reduced = usePrefersReducedMotion();

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      role="presentation"
      className="size-full drop-shadow-xl select-none"
    >
      <defs>
        <linearGradient
          id="av-terra-bg"
          x1="4"
          y1="4"
          x2="44"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#b66035" />
          <stop offset="100%" stopColor="#8a3c1a" />
        </linearGradient>
        <linearGradient
          id="av-stroke-grad"
          x1="12"
          y1="8"
          x2="36"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fdf8f0" />
        </linearGradient>
        <filter
          id="av-shadow"
          x="0"
          y="2"
          width="48"
          height="48"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx="0" dy="2.2" stdDeviation="2.2" floodColor="#240c03" floodOpacity="0.32" />
        </filter>
      </defs>

      {/* Badan: squircle terra */}
      <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#av-terra-bg)" />
      <rect
        x="3.5"
        y="3.5"
        width="41"
        height="41"
        rx="11.5"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1"
      />

      <g filter="url(#av-shadow)">
        {/* Kaki huruf A = sampul buku */}
        <path
          d="M24 8.5L9.5 35.5"
          stroke="url(#av-stroke-grad)"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24 8.5L38.5 35.5"
          stroke="url(#av-stroke-grad)"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tulang punggung buku */}
        <path
          d="M24 10.5V36"
          stroke="url(#av-stroke-grad)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* Lengkung halaman */}
        <path
          d="M9.5 35.5C14 32.5 19 33 24 36C29 33 34 32.5 38.5 35.5"
          stroke="url(#av-stroke-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 38.2C16 36.2 19.8 36.8 24 39C28.2 36.8 32 36.2 35.5 38.2"
          stroke="url(#av-stroke-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.65"
        />
        {/* Mistar ganda */}
        <path
          d="M15 24.5H33"
          stroke="url(#av-stroke-grad)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M13.5 29.5H34.5"
          stroke="url(#av-stroke-grad)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Mahkota berlian */}
        <path d="M24 6L26.5 8.5L24 11L21.5 8.5Z" fill="#ffffff" />
      </g>

      {/* Kilau mahkota — kedipan hidup */}
      {reduced ? null : (
        <motion.path
          d="M33.5 7.5v3M32 9h3"
          stroke="#ffffff"
          strokeWidth="1.1"
          strokeLinecap="round"
          animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 0.6] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      )}

      {/* Simpul seimbang = hidung + jantung: berdenyut */}
      {reduced ? (
        <circle cx="24" cy="24.5" r="2.2" fill="#4ade80" />
      ) : (
        <>
          <motion.circle
            cx="24"
            cy="24.5"
            r="2.2"
            fill="#4ade80"
            opacity="0.5"
            animate={{ scale: [1, 1.9, 1], opacity: [0.5, 0, 0.5] }}
            transition={{
              duration: status === "done" ? 1.2 : 2.6,
              repeat: Infinity,
              ease: "easeOut",
            }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          <motion.circle
            cx="24"
            cy="24.5"
            r="2.2"
            fill="#4ade80"
            animate={{ scale: status === "done" ? [1, 1.3, 1] : 1 }}
            transition={
              status === "done"
                ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </>
      )}

      {/* Mata: putih di atas terra, pupil melihat sekeliling + berkedip */}
      {reduced ? (
        <g>
          <ellipse cx="19.2" cy="15.8" rx="3.1" ry="3.7" fill="#ffffff" />
          <ellipse cx="28.8" cy="15.8" rx="3.1" ry="3.7" fill="#ffffff" />
          <circle cx="19.2" cy="16" r="1.6" fill="#33170a" />
          <circle cx="28.8" cy="16" r="1.6" fill="#33170a" />
        </g>
      ) : (
        <motion.g
          animate={{ scaleY: [1, 1, 0.08, 1, 1] }}
          transition={{
            duration: 4.6,
            repeat: Infinity,
            times: [0, 0.9, 0.94, 0.98, 1],
            ease: "easeInOut",
          }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <ellipse cx="19.2" cy="15.8" rx="3.1" ry="3.7" fill="#ffffff" />
          <ellipse cx="28.8" cy="15.8" rx="3.1" ry="3.7" fill="#ffffff" />
          <motion.g
            animate={{ x: [0, 1.1, -1, 0.5, 0], y: [0, -0.8, 0.6, 0, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <circle cx="19.2" cy="16" r="1.6" fill="#33170a" />
            <circle cx="28.8" cy="16" r="1.6" fill="#33170a" />
            <circle cx="19.8" cy="15.4" r="0.55" fill="#ffffff" />
            <circle cx="29.4" cy="15.4" r="0.55" fill="#ffffff" />
          </motion.g>
        </motion.g>
      )}

      {/* Alis — terangkat saat mengetik */}
      <motion.g
        animate={reduced ? undefined : { y: status === "typing" ? -1.3 : 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <path
          d="M16.3 10.6L21.9 9.9"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M31.7 10.6L26.1 9.9"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </motion.g>

      {/* Pipi — muncul saat antusias */}
      {(status === "typing" || status === "done") && (
        <g fill="#ffffff" opacity="0.35">
          <ellipse cx="15.6" cy="21.4" rx="2" ry="1.3" />
          <ellipse cx="32.4" cy="21.4" rx="2" ry="1.3" />
        </g>
      )}

      {/* Mulut mengikuti status */}
      {status === "typing" ? (
        <path
          d="M20.8 26.3Q24 26.1 27.2 26.3Q27 29.5 24 29.6Q21 29.5 20.8 26.3Z"
          fill="#431f0d"
        />
      ) : status === "done" ? (
        <path
          d="M20.4 26.1Q24 25.9 27.6 26.1Q27.3 30.3 24 30.4Q20.7 30.3 20.4 26.1Z"
          fill="#431f0d"
        />
      ) : (
        <path
          d="M21.3 26.9Q24 28.7 26.7 26.9"
          stroke="#431f0d"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
