"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCcw, Sparkles } from "lucide-react";

interface Chapter {
  label: string;
  time: number;
  badge: string;
}

const CHAPTERS: Chapter[] = [
  { label: "1. Intro Akunio", time: 0, badge: "Intro" },
  { label: "2. Dokumen Berserakan", time: 5, badge: "Masalah" },
  { label: "3. Scan Akurat LLM", time: 11, badge: "Chat AI" },
  { label: "4. Auto-Pilot & Posting", time: 19, badge: "Kendali" },
  { label: "5. Laporan Real-Time", time: 27, badge: "Siap Pakai" },
  { label: "6. Mulai Sekarang", time: 35, badge: "AKUNIO" },
  { label: "7. GRATIS ! (1 Minggu)", time: 39.5, badge: "Trial" },
];

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(44);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    const onLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const restartVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play();
  };

  const jumpToChapter = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    if (video.paused) {
      video.play();
    }
  };

  const activeChapterIndex = CHAPTERS.reduce((acc, ch, idx) => {
    return currentTime >= ch.time ? idx : acc;
  }, 0);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <figure className="relative overflow-hidden rounded-2xl border border-rule bg-paper p-3 shadow-md sm:p-4">
      {/* Chrome header */}
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3 sm:px-2">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-debit opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-debit" />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink">
            Akunio Launch Demo · 44 Detik
          </span>
          <span className="hidden rounded-full bg-terra/10 px-2 py-0.5 text-[10px] font-semibold text-terra sm:inline-block">
            Interaktif
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="tnum rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
            JE-2026-0042 · Live Sync
          </span>
        </div>
      </figcaption>

      {/* Video Canvas wrapper */}
      <div className="group relative aspect-video w-full overflow-hidden rounded-xl border border-rule bg-ink/5">
        <video
          ref={videoRef}
          className="size-full object-cover"
          src="/videos/akunio-launch-v4.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Demo Akunio: tidak perlu jago akuntansi, biarkan AI catat dan laporan otomatis jadi"
        />

        {/* Floating Quick Action Overlay on Video Hover */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 via-black/20 to-transparent p-3 opacity-90 transition-opacity group-hover:opacity-100 sm:p-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Jeda video" : "Putar video"}
              className="flex size-9 items-center justify-center rounded-lg bg-paper/90 text-ink shadow backdrop-blur transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-terra"
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Nyalakan suara" : "Matikan suara"}
              className="flex size-9 items-center justify-center rounded-lg bg-paper/90 text-ink shadow backdrop-blur transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-terra"
            >
              {isMuted ? <VolumeX className="size-4 text-ink-soft" /> : <Volume2 className="size-4 text-terra" />}
            </button>

            <button
              type="button"
              onClick={restartVideo}
              aria-label="Ulang dari awal"
              className="hidden size-9 items-center justify-center rounded-lg bg-paper/90 text-ink shadow backdrop-blur transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-terra sm:flex"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <span className="tnum rounded bg-ink/70 px-2 py-1 text-xs font-mono text-paper backdrop-blur">
              {Math.floor(currentTime)}s / {Math.floor(duration)}s
            </span>
          </div>
        </div>

        {/* Scrubber progress bar */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-rule/40">
          <div
            className="h-full bg-terra transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Chapter Pills - Interactive Navigation */}
      <div className="mt-3.5 border-t border-rule/60 pt-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-ink-soft">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-terra" />
            Klik bab untuk loncat ke momen penting:
          </span>
          <span className="tnum font-medium text-ink">
            Bab {activeChapterIndex + 1} dari 7
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
          {CHAPTERS.map((chapter, idx) => {
            const isActive = idx === activeChapterIndex;
            return (
              <button
                key={chapter.label}
                type="button"
                onClick={() => jumpToChapter(chapter.time)}
                className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                  isActive
                    ? "border-terra/60 bg-terra/10 shadow-xs ring-1 ring-terra/30"
                    : "border-rule/80 bg-canvas/60 hover:border-rule hover:bg-canvas"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${isActive ? "text-terra" : "text-ink-soft"}`}>
                    {chapter.badge}
                  </span>
                  <span className="tnum text-[10px] text-ink-soft/70">
                    {chapter.time}s
                  </span>
                </div>
                <span className={`mt-0.5 line-clamp-1 text-xs font-medium ${isActive ? "text-ink font-semibold" : "text-ink-soft"}`}>
                  {chapter.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
