import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from "../sidebar-layout.js";
import { useT } from "../i18n/index.js";

/** Pointer within this distance of the boundary vertical center reveals the tab. */
const TAB_REVEAL_CENTER_RADIUS_PX = 80;

interface SidebarBoundaryControlProps {
  collapsed: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onToggleCollapsed: () => void;
}

export function SidebarBoundaryControl({
  collapsed,
  width,
  onWidthChange,
  onToggleCollapsed,
}: SidebarBoundaryControlProps) {
  const t = useT();
  const boundaryRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [nearCenter, setNearCenter] = useState(false);
  const [tabHover, setTabHover] = useState(false);

  const tabVisible = collapsed || nearCenter || tabHover;

  const updateNearCenter = (clientY: number) => {
    if (collapsed) return;
    const boundary = boundaryRef.current;
    if (!boundary) return;
    const rect = boundary.getBoundingClientRect();
    const centerY = rect.height / 2;
    const y = clientY - rect.top;
    setNearCenter(Math.abs(y - centerY) <= TAB_REVEAL_CENTER_RADIUS_PX);
  };

  const endDrag = (target: HTMLDivElement, pointerId: number) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    target.releasePointerCapture(pointerId);
    document.body.classList.remove("chestnut-sidebar-resizing");
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
    document.body.classList.add("chestnut-sidebar-resizing");
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateNearCenter(event.clientY);
    if (!dragRef.current) return;
    const delta = event.clientX - dragRef.current.startX;
    onWidthChange(clampSidebarWidth(dragRef.current.startWidth + delta));
  };

  const onBoundaryPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateNearCenter(event.clientY);
  };

  const onBoundaryPointerLeave = () => {
    if (!tabHover) setNearCenter(false);
  };

  const onToggleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (collapsed) {
      onWidthChange(SIDEBAR_WIDTH_DEFAULT);
    }
    onToggleCollapsed();
  };

  return (
    <div
      ref={boundaryRef}
      className={`chestnut-sidebar-boundary${collapsed ? " is-collapsed" : ""}`}
      onPointerMove={onBoundaryPointerMove}
      onPointerLeave={onBoundaryPointerLeave}
    >
      {!collapsed && (
        <div
          className="chestnut-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("sidebar.resizeAria")}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={(event) => endDrag(event.currentTarget, event.pointerId)}
          onPointerCancel={(event) => endDrag(event.currentTarget, event.pointerId)}
        />
      )}

      <div
        className={`chestnut-sidebar-collapse-tab-slot${collapsed ? " is-collapsed" : ""}`}
        onPointerEnter={() => setTabHover(true)}
        onPointerLeave={() => {
          setTabHover(false);
          if (!collapsed) setNearCenter(false);
        }}
      >
        <button
          type="button"
          className={`chestnut-sidebar-collapse-tab${collapsed ? " is-collapsed" : ""}${tabVisible ? " is-visible" : ""}`}
          aria-label={collapsed ? t("sidebar.expandAria") : t("sidebar.collapseAria")}
          aria-expanded={!collapsed}
          aria-hidden={!tabVisible}
          tabIndex={tabVisible ? 0 : -1}
          onClick={onToggleClick}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <svg
            className="chestnut-sidebar-collapse-tab-svg"
            viewBox="0 0 10 120"
            width="10"
            height="120"
            focusable="false"
            aria-hidden="true"
          >
            <path className="chestnut-sidebar-collapse-tab-shape" d="M0 0 L0 120 L10 110.4 L10 9.6 Z" />
            {collapsed ? (
              <path
                className="chestnut-sidebar-collapse-tab-chevron"
                d="M2.5 55 L6.5 60 L2.5 65"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                className="chestnut-sidebar-collapse-tab-chevron"
                d="M6.5 55 L2.5 60 L6.5 65"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
