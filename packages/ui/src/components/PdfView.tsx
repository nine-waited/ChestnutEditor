import { useEffect, useState } from "react";
import { vaultService } from "../store.js";
import { useT } from "../i18n/index.js";

interface PdfViewProps {
  path: string;
}

export function PdfView({ path }: PdfViewProps) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fileName = path.split("/").pop() ?? path;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setError(false);

    vaultService
      .readBinary(path)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (error) {
    return (
      <div className="chestnut-pdf-view chestnut-pdf-view--error">
        {t("pdf.loadFailed", { name: fileName })}
      </div>
    );
  }

  if (!src) {
    return <div className="chestnut-pdf-view chestnut-pdf-view--loading">{t("pdf.loading")}</div>;
  }

  return (
    <div className="chestnut-pdf-view" tabIndex={-1}>
      <iframe src={src} title={fileName} className="chestnut-pdf-view-frame" />
    </div>
  );
}
