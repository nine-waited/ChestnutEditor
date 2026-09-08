import type { CSSProperties } from "react";

/** Top toolbar vault path layout tweaks. */
export const TOOLBAR_PATH_LAYOUT = {
  copyGapPx: 2,
  /** Copy icon vertical offset (px). Positive = down, negative = up. */
  copyOffsetYPx: 2,
} as const;

export function toolbarPathGroupStyle(): CSSProperties {
  return {
    ["--chestnut-toolbar-path-copy-gap" as string]: `${TOOLBAR_PATH_LAYOUT.copyGapPx}px`,
    ["--chestnut-toolbar-path-copy-offset-y" as string]: `${TOOLBAR_PATH_LAYOUT.copyOffsetYPx}px`,
  };
}

export function copyButtonStyle(): CSSProperties {
  return { transform: `translateY(${TOOLBAR_PATH_LAYOUT.copyOffsetYPx}px)` };
}
