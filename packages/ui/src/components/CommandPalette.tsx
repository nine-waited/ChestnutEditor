import { fileBaseName } from "@chestnut/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/index.js";
import { vaultService, useAppStore } from "../store.js";
import { confirmAndDeleteVaultPath } from "../note-actions.js";
import { openVaultEntry } from "../vault-entry-open.js";
import { fileTreeSelection } from "../file-tree-selection.js";
import { revealFileInTree, revealFileInTreeWhenReady } from "../file-tree-expand-context.js";

function openAndHighlightFile(path: string): void {
  fileTreeSelection.selectExclusive(path, "file");
  openVaultEntry(path);
  revealFileInTree(path);
  void revealFileInTreeWhenReady(path);
}

export function CommandPalette() {
  const t = useT();
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [files, setFiles] = useState<Array<{ path: string; title: string }>>([]);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const loadFiles = () => {
    vaultService.listQuickOpenFiles().then((list) => {
      setFiles(
        list.map((f) => ({
          path: f.path,
          title: fileBaseName(f.path),
        })),
      );
    });
  };

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    loadFiles();
  }, [open]);

  const deleteFile = async (path: string, label: string, index: number) => {
    const deleted = await confirmAndDeleteVaultPath(path, "file", label);
    if (!deleted) return;
    setFiles((prev) => prev.filter((f) => f.path !== path));
    setSelected((s) => {
      if (index < s) return s - 1;
      if (index === s) return Math.max(0, s - 1);
      return s;
    });
  };

  const items = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = q
      ? files.filter((f) => f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      : files;
    return filtered.slice(0, 20);
  }, [files, query]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, items.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && items[selected]) {
        e.preventDefault();
        openAndHighlightFile(items[selected].path);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, selected, setOpen]);

  if (!open) return null;

  return (
    <div className="chestnut-modal-overlay" onClick={() => setOpen(false)}>
      <div className="chestnut-palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={t("palette.quickOpenPlaceholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />
        <div className="chestnut-palette-list">
          {items.map((item, i) => (
            <div
              key={item.path}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={`chestnut-palette-item${i === selected ? " selected" : ""}`}
              onClick={() => {
                openAndHighlightFile(item.path);
                setOpen(false);
              }}
            >
              <div className="chestnut-palette-item-main">
                {item.title}
                <small>{item.path}</small>
              </div>
              <button
                type="button"
                className="chestnut-palette-item-delete"
                title={t("palette.deleteFile")}
                aria-label={t("palette.deleteFileAria", { name: item.title })}
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteFile(item.path, item.title, i);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="chestnut-palette-item" style={{ color: "var(--chestnut-text-muted)" }}>
              {t("palette.noResults")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
