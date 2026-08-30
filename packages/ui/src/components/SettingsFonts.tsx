import { useEffect, useState } from "react";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { confirmAction } from "../confirm-dialog.js";
import {
  DEFAULT_UI_FONT,
  UI_FONTS,
  isDownloadableUiFont,
  unloadDownloadedFontFace,
  type UiFont,
} from "../ui-font.js";
import {
  downloadUiFontFile,
  formatUiFontDownloadProgress,
  listenUiFontDownloadProgress,
  listInstalledUiFonts,
  uninstallUiFontFile,
  UI_FONT_DOWNLOAD_BYTES,
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

  async function refreshInstalled() {
    const ids = await listInstalledUiFonts();
    setInstalled(ids);
  }

  useEffect(() => {
    void refreshInstalled();
  }, []);

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
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.fontHint")}</p>
      <ul className="boke-font-list" role="radiogroup" aria-label={t("settings.font")}>
        {UI_FONTS.map((item) => {
          const font = item.value;
          const checked = uiFont === font;
          const downloadable = isDownloadableUiFont(font);
          const isInstalled = !downloadable || installed.includes(font);
          const isBusy = busy.has(font);
          const error = errors[font];
          const downloadProgress = progress[font];
          return (
            <li key={font} className="boke-font-row">
              <button
                type="button"
                className="boke-font-item"
                role="radio"
                aria-checked={checked}
                disabled={isBusy || !isInstalled}
                onClick={() => {
                  void selectFont(font);
                }}
              >
                <span className="boke-font-item-mark" aria-hidden />
                <span className="boke-font-item-text">
                  <strong>{t(item.labelKey)}</strong>
                  {downloadable ? (
                    <span className="boke-font-item-desc">
                      {isBusy && !isInstalled
                        ? t("settings.fontDownloading")
                        : isInstalled
                          ? t("settings.fontInstalled")
                          : t("settings.fontNotInstalled")}
                    </span>
                  ) : (
                    <span className="boke-font-item-desc">{t("settings.fontSystemHint")}</span>
                  )}
                  {error ? <span className="boke-font-item-error">{error}</span> : null}
                </span>
                {downloadProgress ? (
                  <span className="boke-font-item-progress">
                    {formatUiFontDownloadProgress(downloadProgress.received, downloadProgress.total)}
                  </span>
                ) : null}
              </button>
              {downloadable ? (
                isInstalled ? (
                  <button
                    type="button"
                    className="boke-font-action boke-font-action--danger"
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
                    className="boke-font-action"
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
      </ul>
    </>
  );
}

function labelKey(font: UiFont): string {
  return UI_FONTS.find((item) => item.value === font)?.labelKey ?? font;
}
