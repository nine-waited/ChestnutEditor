import html2pdf from "html2pdf.js";
import { fileBaseName, pdfPathForMarkdown } from "@chestnut/core";
import { isTauri } from "@chestnut/storage-adapters";
import { useExportProgressStore } from "./export-progress.js";
import {
  buildMarkdownExportBody,
  escapeHtml,
  pdfExportStyles,
  rasterizeImagesForExport,
  waitForExportImages,
} from "./markdown-export-utils.js";
import { useAppStore, vaultService } from "./store.js";
import { getUiFontStack } from "./ui-font.js";

export async function exportMarkdownToPdf(relativePath: string): Promise<string> {
  if (!isTauri()) throw new Error("PDF export requires desktop app");

  const outputPath = pdfPathForMarkdown(relativePath);
  const title = fileBaseName(relativePath);
  const progress = useExportProgressStore.getState();

  progress.start({
    fileName: `${title}.pdf`,
    titleKey: "exportPdf.title",
    phasePrefix: "exportPdf",
  });

  try {
    progress.setProgress(8, "prepare");
    const content = await vaultService.read(relativePath);

    progress.setProgress(22, "render");
    progress.setProgress(36, "images");
    const bodyHtml = await buildMarkdownExportBody(content, relativePath);
    const fontStack = getUiFontStack(useAppStore.getState().uiFont);

    const styleEl = document.createElement("style");
    styleEl.textContent = pdfExportStyles(fontStack);

    const root = document.createElement("div");
    root.className = "chestnut-pdf-export-root";
    root.innerHTML = `<h1>${escapeHtml(title)}</h1>${bodyHtml}`;

    const mount = document.createElement("div");
    mount.style.position = "fixed";
    mount.style.left = "0";
    mount.style.top = "0";
    mount.style.width = "186mm";
    mount.style.visibility = "hidden";
    mount.style.pointerEvents = "none";
    mount.style.zIndex = "-9999";
    mount.style.overflow = "visible";
    mount.append(styleEl, root);
    document.body.appendChild(mount);

    try {
      progress.setProgress(45, "generate");
      progress.startGeneratingTicker();

      await document.fonts.ready;
      await waitForExportImages(root);
      // Let layout settle after fonts and images load.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      rasterizeImagesForExport(root);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const pdfOptions = {
          margin: [12, 12, 12, 12],
          filename: `${title}.pdf`,
          image: { type: "jpeg" as const, quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
          pagebreak: {
            mode: ["css", "avoid-all"] as const,
            avoid: [
              ".chestnut-pdf-export-root > *",
              "p",
              "li",
              "h1",
              "h2",
              "h3",
              "h4",
              "h5",
              "h6",
              "blockquote",
              "table",
              "img",
              "canvas[data-export-image='true']",
              "tr",
            ],
          },
        };

      const pdfBlob = await html2pdf()
        .set(pdfOptions as object)
        .from(root)
        .outputPdf("blob");

      progress.stopTicker();
      progress.setProgress(92, "save");

      await vaultService.ensureExportTargetDir();
      const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
      await vaultService.writeBinary(outputPath, bytes);

      await progress.finishSuccess();
      return outputPath;
    } finally {
      mount.remove();
      progress.stopTicker();
    }
  } catch (err) {
    progress.fail();
    throw err;
  }
}
