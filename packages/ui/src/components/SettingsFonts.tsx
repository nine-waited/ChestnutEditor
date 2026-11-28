import { useEffect, useState } from "react";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { confirmAction } from "../confirm-dialog.js";
import { isTauri } from "@chestnut/storage-adapters";
import {
  DEFAULT_UI_FONT,
  UI_FONTS,
  customUiFont,
  isCustomUiFont,
  isDownloadableUiFont,
  loadDownloadedFontFace,
  unloadDownloadedFontFace,
  type UiFont,
} from "../ui-font.js";
import {
  downloadUiFontFile,
  formatUiFontDownloadProgress,
  importCustomUiFont,
  listCustomUiFonts,
  listenUiFontDownloadProgress,
  listInstalledUiFonts,
  removeCustomUiFont,
  uninstallUiFontFile,
  UI_FONT_DOWNLOAD_BYTES,
  type CustomUiFontFile,
  type UiFontDownloadProgress,
} from "../ui-font-desktop.js";

export function SettingsFonts() {
  const t = useT();
  const uiFont = useAppStore((s) => s.uiFont);
  const setUiFont = useAppStore((s) => s.setUiFont);
  const [installed, setInstalled] = useState<UiFont[]>([]);
  const [busy, setBusy] = useState<ReadonlySet<UiFont>>(() => new Set());
  const [errors, setErrors] = useState<Partial<Record<UiFont, string>>>({});
  const [progress, setProgress] = useState<Partial<Record<UiFont, UiFontDownloadProgress>>>({});

  const [customFonts, setCustomFonts] = useState<CustomUiFontFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function refreshInstalled() {
    const ids = await listInstalledUiFonts();
    setInstalled(ids);
  }

  async function refreshCustom() {
    setCustomFonts(await listCustomUiFonts());
  }

  useEffect(() => {
    void refreshInstalled();
    void refreshCustom();
  }, []);

  async function importCustom() {
    if (importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const imported = await importCustomUiFont();
      if (!imported) return;
      await refreshCustom();
      const font = customUiFont(imported.id);
      try {
        await loadDownloadedFontFace(font);
        setUiFont(font);
      } catch (err) {
        setErrors((prev) => ({ ...prev, [font]: err instanceof Error ? err.message : String(err) }));
      }
    } catch (err) {
      setImportError(
        t("settings.fontImportFailed", { error: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setImporting(false);
    }
  }

  async function removeCustom(item: CustomUiFontFile) {
    const font = customUiFont(item.id);
    if (busy.has(font)) return;
    const ok = await confirmAction({
      title: t("settings.fontRemoveTitle"),
      message: t("settings.fontRemoveMessage", { name: item.name }),
      confirmLabel: t("settings.fontRemove"),
      danger: true,
    });
    if (!ok) return;
    setFontBusy(font, true);
    try {
      if (useAppStore.getState().uiFont === font) setUiFont(DEFAULT_UI_FONT);
      unloadDownloadedFontFace(font);
      await removeCustomUiFont(item.id);
      await refreshCustom();
    } catch (err) {
      setErrors((prev) => ({ ...prev, [font]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setFontBusy(font, false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenUiFontDownloadProgress((payload) => {
      if (cancelled || !isDownloadableUiFont(payload.id)) return;
      setProgress((prev) => ({ ...prev, [payload.id]: payload }));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  function setFontBusy(font: UiFont, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(font);
      else next.delete(font);
      return next;
    });
  }

  function canSelect(font: UiFont): boolean {
    if (isCustomUiFont(font)) return customFonts.some((item) => customUiFont(item.id) === font);
    return !isDownloadableUiFont(font) || installed.includes(font);
  }

  async function selectFont(font: UiFont) {
    if (busy.has(font) || !canSelect(font)) return;
    setUiFont(font);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[font];
      return next;
    });
  }

  async function download(font: UiFont) {
    if (busy.has(font) || !isDownloadableUiFont(font)) return;
    setFontBusy(font, true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[font];
      return next;
    });
    setProgress((prev) => ({
      ...prev,
      [font]: { id: font, received: 0, total: UI_FONT_DOWNLOAD_BYTES[font] },
    }));
    try {
      await downloadUiFontFile(font);
      await refreshInstalled();
    } catch (err) {
      console.error(`[Chestnut] download UI font failed (${font}):`, err);
      setErrors((prev) => ({
        ...prev,
        [font]: t("settings.fontDownloadFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      }));
    } finally {
      setFontBusy(font, false);
      setProgress((prev) => {
        const next = { ...prev };
        delete next[font];
        return next;
      });
    }
  }

  async function uninstall(font: UiFont) {
    if (busy.has(font) || !isDownloadableUiFont(font)) return;
    const ok = await confirmAction({
      title: t("settings.fontUninstallTitle"),
      message: t("settings.fontUninstallMessage", { name: t(labelKey(font)) }),
      confirmLabel: t("settings.fontUninstall"),
      danger: true,
    });
    if (!ok) return;
    setFontBusy(font, true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[font];
      return next;
    });
    try {
      if (useAppStore.getState().uiFont === font) setUiFont(DEFAULT_UI_FONT);
      unloadDownloadedFontFace(font);
      await uninstallUiFontFile(font);
      await refreshInstalled();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [font]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setFontBusy(font, false);
    }
  }

  return (
    <>
      <h3>{t("settings.font")}</h3>
      <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>{t("settings.fontHint")}</p>
      <ul className="chestnut-font-list" role="radiogroup" aria-label={t("settings.font")}>
        {UI_FONTS.map((item) => {
          const font = item.value;
          const checked = uiFont === font;
          const downloadable = isDownloadableUiFont(font);
          const isInstalled = !downloadable || installed.includes(font);
          const isBusy = busy.has(font);
          const error = errors[font];
          const downloadProgress = progress[font];
          return (
            <li key={font} className="chestnut-font-row">
              <button
                type="button"
                className="chestnut-font-item"
                role="radio"
                aria-checked={checked}
                disabled={isBusy || !isInstalled}
                onClick={() => {
                  void selectFont(font);
                }}
              >
                <span className="chestnut-font-item-mark" aria-hidden />
                <span className="chestnut-font-item-text">
                  <strong>{t(item.labelKey)}</strong>
                  {downloadable ? (
                    <span className="chestnut-font-item-desc">
                      {isBusy && !isInstalled
                        ? t("settings.fontDownloading")
                        : isInstalled
                          ? t("settings.fontInstalled")
                          : t("settings.fontNotInstalled")}
                    </span>
                  ) : (
                    <span className="chestnut-font-item-desc">{t("settings.fontSystemHint")}</span>
                  )}
                  {error ? <span className="chestnut-font-item-error">{error}</span> : null}
                </span>
                {downloadProgress ? (
                  <span className="chestnut-font-item-progress">
                    {formatUiFontDownloadProgress(downloadProgress.received, downloadProgress.total)}
                  </span>
                ) : null}
              </button>
              {downloadable ? (
                isInstalled ? (
                  <button
                    type="button"
                    className="chestnut-font-action chestnut-font-action--danger"
                    disabled={isBusy}
                    onClick={() => {
                      void uninstall(font);
                    }}
                  >
                    {t("settings.fontUninstall")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chestnut-font-action"
                    disabled={isBusy}
                    onClick={() => {
                      void download(font);
                    }}
                  >
                    {isBusy ? t("settings.fontDownloading") : t("settings.fontDownload")}
                  </button>
                )
              ) : null}
            </li>
          );
        })}
        {customFonts.map((item) => {
          const font = customUiFont(item.id);
          const isBusy = busy.has(font);
          const error = errors[font];
          return (
            <li key={font} className="chestnut-font-row">
              <button
                type="button"
                className="chestnut-font-item"
                role="radio"
                aria-checked={uiFont === font}
                disabled={isBusy}
                onClick={() => {
                  void selectFont(font);
                }}
              >
                <span className="chestnut-font-item-mark" aria-hidden />
                <span className="chestnut-font-item-text">
                  <strong>{item.name}</strong>
                  <span className="chestnut-font-item-desc">{t("settings.fontCustomHint")}</span>
                  {error ? <span className="chestnut-font-item-error">{error}</span> : null}
                </span>
              </button>
              <button
                type="button"
                className="chestnut-font-action chestnut-font-action--danger"
                disabled={isBusy}
                onClick={() => {
                  void removeCustom(item);
                }}
              >
                {t("settings.fontRemove")}
              </button>
            </li>
          );
        })}
      </ul>
      {isTauri() ? (
        <div className="chestnut-font-import">
          <button
            type="button"
            className="chestnut-font-action"
            disabled={importing}
            onClick={() => {
              void importCustom();
            }}
          >
            {t("settings.fontImport")}
          </button>
          {importError ? <span className="chestnut-font-item-error">{importError}</span> : null}
        </div>
      ) : null}
    </>
  );
}

function labelKey(font: UiFont): string {
  return UI_FONTS.find((item) => item.value === font)?.labelKey ?? font;
}
