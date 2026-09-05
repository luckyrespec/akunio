"use client";

import * as React from "react";
import {
  Search,
  Upload,
  Loader2,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  SidebarOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LibraryFile {
  id: string;
  storageKey: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

interface AsistenLibraryViewProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  libraryFiles: LibraryFile[];
  libraryLoading: boolean;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  uploading: boolean;
  onAskFileInChat: (file: LibraryFile) => void;
}

export function AsistenLibraryView({
  sidebarOpen,
  setSidebarOpen,
  libraryFiles,
  libraryLoading,
  onUploadFiles,
  uploading,
  onAskFileInChat,
}: AsistenLibraryViewProps) {
  const [librarySearch, setLibrarySearch] = React.useState("");
  const [libraryFilter, setLibraryFilter] = React.useState<"all" | "images" | "docs">("all");
  const [librarySort, setLibrarySort] = React.useState<"desc" | "asc">("desc");
  const [libraryLayout, setLibraryLayout] = React.useState<"list" | "grid">("list");

  const libraryUploadInputRef = React.useRef<HTMLInputElement>(null);

  const filteredLibraryFiles = libraryFiles
    .filter((f) => {
      const matchesSearch = f.fileName.toLowerCase().includes(librarySearch.toLowerCase());
      if (!matchesSearch) return false;
      if (libraryFilter === "images") {
        return f.mime.startsWith("image/");
      }
      if (libraryFilter === "docs") {
        return f.mime === "application/pdf" || f.mime.includes("sheet") || f.mime.includes("document");
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return librarySort === "desc" ? dateB - dateA : dateA - dateB;
    });

  return (
    <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden min-w-0 bg-canvas">
      {/* Header Pustaka */}
      <div className="flex h-14 items-center justify-between border-b border-rule bg-paper/60 px-4 md:px-8 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
              aria-label="Buka sidebar"
            >
              <SidebarOpen className="size-4" />
            </Button>
          )}
          <h1 className="font-display text-lg md:text-xl font-bold tracking-tight text-ink">Pustaka</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative w-48 md:w-64">
            <Search className="absolute left-3 top-2.5 size-3.5 text-ink-soft" />
            <input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Cari..."
              className="h-8 w-full rounded-full border border-rule bg-paper pl-8 pr-3 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra"
            />
          </div>

          {/* Upload Button */}
          <input
            ref={libraryUploadInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onUploadFiles(e.target.files);
            }}
          />
          <Button
            onClick={() => libraryUploadInputRef.current?.click()}
            disabled={uploading}
            size="sm"
            className="h-8 gap-1.5 rounded-full bg-terra text-white text-xs px-3 shadow-2xs hover:bg-terra/90"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            <span>Unggah Berkas</span>
          </Button>
        </div>
      </div>

      {/* Controls Bar: Filter Pills, Sort & Layout Toggle */}
      <div className="flex items-center justify-between px-4 md:px-8 py-3.5 border-b border-rule/70 bg-paper/30 shrink-0">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLibraryFilter("all")}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-medium transition-colors",
              libraryFilter === "all"
                ? "bg-ink text-paper font-semibold"
                : "text-ink-soft hover:bg-canvas hover:text-ink",
            )}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setLibraryFilter("images")}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-medium transition-colors",
              libraryFilter === "images"
                ? "bg-ink text-paper font-semibold"
                : "text-ink-soft hover:bg-canvas hover:text-ink",
            )}
          >
            Gambar
          </button>
          <button
            type="button"
            onClick={() => setLibraryFilter("docs")}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-medium transition-colors",
              libraryFilter === "docs"
                ? "bg-ink text-paper font-semibold"
                : "text-ink-soft hover:bg-canvas hover:text-ink",
            )}
          >
            Dokumen
          </button>
        </div>

        {/* Sort and Layout Controls */}
        <div className="flex items-center gap-2 text-ink-soft">
          <button
            type="button"
            onClick={() => setLibrarySort((s) => (s === "desc" ? "asc" : "desc"))}
            className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs hover:bg-canvas hover:text-ink transition-colors"
            title="Urutkan tanggal"
          >
            <ArrowUpDown className="size-3.5" />
            <span className="hidden sm:inline">{librarySort === "desc" ? "Terbaru" : "Terlama"}</span>
          </button>

          <div className="h-4 w-px bg-rule/70" />

          <button
            type="button"
            onClick={() => setLibraryLayout("list")}
            className={cn(
              "p-1.5 rounded-lg hover:bg-canvas transition-colors",
              libraryLayout === "list" ? "text-ink bg-canvas shadow-2xs" : "text-ink-soft",
            )}
            aria-label="Tampilan daftar"
          >
            <LayoutList className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setLibraryLayout("grid")}
            className={cn(
              "p-1.5 rounded-lg hover:bg-canvas transition-colors",
              libraryLayout === "grid" ? "text-ink bg-canvas shadow-2xs" : "text-ink-soft",
            )}
            aria-label="Tampilan kisi"
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {libraryLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-ink-soft">
            <Loader2 className="size-6 animate-spin text-terra" />
            <span className="text-xs">Memuat dokumen pustaka...</span>
          </div>
        ) : filteredLibraryFiles.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-ink-soft">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-paper border border-rule">
              <FileText className="size-6 text-ink-soft/60" />
            </div>
            <p className="font-display font-semibold text-sm text-ink mt-2">Tidak ada berkas ditemukan</p>
            <p className="text-xs max-w-sm">
              {librarySearch
                ? "Coba gunakan kata kunci pencarian lain."
                : "Unggah dokumen atau nota dari sini atau kirim langsung di chat percakapan."}
            </p>
          </div>
        ) : libraryLayout === "list" ? (
          /* List Table View */
          <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-rule bg-canvas/60 text-ink-soft font-semibold">
                <tr>
                  <th className="px-4 py-3">Nama Berkas</th>
                  <th className="px-4 py-3">Tanggal Unggah</th>
                  <th className="px-4 py-3">Ukuran</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/50">
                {filteredLibraryFiles.map((file) => {
                  const isPdf = file.mime === "application/pdf";
                  const isImage = file.mime.startsWith("image/");
                  const sizeFormatted = `${(file.sizeBytes / 1024).toFixed(0)} KB`;
                  const dateFormatted = new Date(file.createdAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

                  return (
                    <tr key={file.id} className="hover:bg-canvas/50 transition-colors">
                      <td className="px-4 py-3 flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-rule">
                          {isPdf ? (
                            <FileText className="size-4 text-terra" />
                          ) : isImage ? (
                            <ImageIcon className="size-4 text-blue-600" />
                          ) : (
                            <FileSpreadsheet className="size-4 text-emerald-600" />
                          )}
                        </div>
                        <span className="font-medium text-ink truncate max-w-md" title={file.fileName}>
                          {file.fileName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{dateFormatted}</td>
                      <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{sizeFormatted}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAskFileInChat(file)}
                          className="h-7 text-[11px] text-terra hover:text-terra hover:bg-canvas rounded-lg px-2.5"
                        >
                          Tanyakan di Chat
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {filteredLibraryFiles.map((file) => {
              const isPdf = file.mime === "application/pdf";
              const isImage = file.mime.startsWith("image/");
              const sizeFormatted = `${(file.sizeBytes / 1024).toFixed(0)} KB`;
              const dateFormatted = new Date(file.createdAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              });

              return (
                <div
                  key={file.id}
                  className="flex flex-col justify-between rounded-2xl border border-rule bg-paper p-3.5 shadow-xs hover:border-terra/60 transition-[border-color,box-shadow] group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-canvas border border-rule">
                      {isPdf ? (
                        <FileText className="size-4 text-terra" />
                      ) : isImage ? (
                        <ImageIcon className="size-4 text-blue-600" />
                      ) : (
                        <FileSpreadsheet className="size-4 text-emerald-600" />
                      )}
                    </div>
                    <span className="text-[11px] text-ink-soft">{dateFormatted}</span>
                  </div>

                  <div className="mt-3 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="text-[11px] text-ink-soft mt-0.5">{sizeFormatted}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-rule/50 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAskFileInChat(file)}
                      className="h-6 text-[11px] text-terra hover:text-terra hover:bg-canvas px-2"
                    >
                      Chat
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
