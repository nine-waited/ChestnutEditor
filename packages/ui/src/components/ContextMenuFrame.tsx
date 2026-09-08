import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clampContextMenuPosition } from "../context-menu-position.js";

interface ContextMenuFrameProps {
  x: number;
  y: number;
  className?: string;
  children: ReactNode;
  onMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
}

export function ContextMenuFrame({
  x,
  y,
  className = "chestnut-context-menu",
  children,
  onMouseDown,
  onClick,
  onContextMenu,
}: ContextMenuFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition(clampContextMenuPosition(x, y, width, height));
  }, [x, y, children]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={{
        top: position?.y ?? y,
        left: position?.x ?? x,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event);
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
