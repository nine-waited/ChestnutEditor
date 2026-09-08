import { useEffect, useState } from "react";
import { vaultService } from "../store.js";
import { useT } from "../i18n/index.js";

interface ImageViewProps {
  path: string;
}

export function ImageView({ path }: ImageViewProps) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fileName = path.split("/").pop() ?? path;

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(false);

    vaultService
      .getAssetUrl(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error) {
    return (
      <div className="chestnut-image-view chestnut-image-view--error">
        {t("image.loadFailed", { name: fileName })}
      </div>
    );
  }

  if (!src) {
    return <div className="chestnut-image-view chestnut-image-view--loading">{t("image.loading")}</div>;
  }

  return (
    <div className="chestnut-image-view" tabIndex={-1}>
      <img src={src} alt={fileName} className="chestnut-image-view-img" draggable={false} />
    </div>
  );
}
