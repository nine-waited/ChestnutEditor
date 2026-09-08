import type { ReactNode } from "react";

export function ToolbarIconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** When set, marks the button as a toggle (aria-pressed). */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="chestnut-toolbar-icon-btn"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      data-tooltip={label}
    >
      {children}
    </button>
  );
}
