import type { ReactNode } from "react";
import { useT } from "../i18n/index.js";
import { createAndOpenDrawing, createAndOpenNote, createFolder } from "../note-actions.js";
import { useAppStore } from "../store.js";
import {
  CollapseAllFoldersIcon,
  ExcalidrawGrayIcon,
  EyeIcon,
  EyeOffIcon,
  FolderPlusIcon,
  NoteEditIcon,
} from "../icons/sidebar-icons.js";
import { useFileTreeExpand } from "../file-tree-expand-context.js";

function SidebarNavButton({
  label,
  onClick,
  children,
  className = "",
  disabled = false,
  pressed = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`boke-sidebar-nav-btn ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
    >
      {children}
    </button>
  );
}

export function SidebarNav() {
  const t = useT();
  const { collapseAll } = useFileTreeExpand();
  const showNotePicFolders = useAppStore((s) => s.showNotePicFolders);
  const toggleShowNotePicFolders = useAppStore((s) => s.toggleShowNotePicFolders);

  return (
    <nav className="boke-sidebar-nav" aria-label={t("sidebar.navAria")}>
      <SidebarNavButton label={t("sidebar.newNote")} onClick={() => void createAndOpenNote()}>
        <NoteEditIcon />
      </SidebarNavButton>
      <SidebarNavButton
        label={t("sidebar.newDrawing")}
        className="boke-sidebar-nav-btn--excalidraw"
        onClick={() => void createAndOpenDrawing()}
      >
        <ExcalidrawGrayIcon />
      </SidebarNavButton>
      <SidebarNavButton label={t("sidebar.newFolder")} onClick={() => void createFolder()}>
        <FolderPlusIcon />
      </SidebarNavButton>
      <SidebarNavButton
        label={showNotePicFolders ? t("fileTree.hidePicFolders") : t("fileTree.showPicFolders")}
        onClick={toggleShowNotePicFolders}
      >
        {showNotePicFolders ? <EyeIcon /> : <EyeOffIcon />}
      </SidebarNavButton>
      <SidebarNavButton label={t("fileTree.collapseAll")} onClick={collapseAll}>
        <CollapseAllFoldersIcon />
      </SidebarNavButton>
    </nav>
  );
}
