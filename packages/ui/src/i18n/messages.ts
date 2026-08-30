export type Locale = "en" | "zh-CN";

export const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
];

type MessageTable = Record<string, string>;

const en: MessageTable = {
  "vault.loading": "Opening vault…",
  "vault.desktopOnly": "Local folder selection is only available in the desktop app.",
  "vault.pathAria": "Vault path",
  "vault.pathPlaceholder": "Enter vault folder path",
  "welcome.hint": "Select a file or create a new note.",
  "welcome.newNote": "New note",
  "toolbar.quickOpen": "Quick open",
  "toolbar.search": "Search",
  "toolbar.settings": "Settings",
  "toolbar.quickOpenTooltip": "Quick open ({shortcut})",
  "toolbar.searchTooltip": "Search notes ({shortcut})",
  "toolbar.settingsTooltip": "Open settings",
  "toolbar.importMarkdownTooltip": "Import Markdown folder",
  "toolbar.alwaysOnTopOffTooltip": "Keep window on top (off)",
  "toolbar.alwaysOnTopOnTooltip": "Keep window on top (on)",
  "toolbar.splitOffTooltip": "Split editor left / right",
  "toolbar.splitOnTooltip": "Exit split view",
  "toolbar.pickFolder": "Choose folder",
  "toolbar.pickFolderAria": "Choose vault folder",
  "toolbar.copyVaultPath": "Copy path",
  "toolbar.copyVaultPathAria": "Copy vault path to clipboard",
  "toolbar.vaultPathAria": "Vault path",
  "toolbar.vaultPathHint": "Vault: {path}",
  "toolbar.vaultPathPickHint": "Click to choose folder — {path}",
  "status.ready": "Ready",
  "status.pickFolderFailed": "Failed to open folder picker.",
  "status.vaultPathInvalid": "Invalid vault path.",
  "status.vaultPathCopied": "Path copied.",
  "status.fileCopied": "File copied.",
  "status.copyFailed": "Failed to copy to clipboard.",
  "status.copyFileDesktopOnly": "Copying files requires the desktop app.",
  "status.pasteSuccess": "Pasted {count} item(s).",
  "status.pasteFailed": "Failed to paste.",
  "status.pasteEmpty": "Clipboard has no files to paste.",
  "status.pasteDesktopOnly": "Pasting files requires the desktop app.",
  "status.pasteNotAllowedHere": "Cannot paste into this folder.",
  "status.exportPdfFailed": "Failed to export PDF.",
  "status.exportMarkdownFailed": "Failed to export Markdown.",
  "status.exportZipFailed": "Failed to export ZIP.",
  "status.revealInFileManagerFailed": "Failed to reveal in file manager.",
  "status.exportPdfSuccess": "Exported and opened PDF: {path}",
  "status.exportMarkdownSuccess": "Exported Markdown bundle: {path}",
  "status.exportZipSuccess": "Exported ZIP: {path}",
  "status.importMarkdownFailed": "Failed to import Markdown folder.",
  "status.importMarkdownSuccess": "Imported Markdown note: {path}",
  "status.alwaysOnTopFailed": "Failed to change always-on-top.",
  "status.pinImageFailed": "Failed to pin image to desktop.",
  "exportPdf.title": "Exporting PDF",
  "exportPdf.phasePrepare": "Preparing",
  "exportPdf.phaseRender": "Rendering content",
  "exportPdf.phaseImages": "Loading images",
  "exportPdf.phaseGenerate": "Generating PDF",
  "exportPdf.phaseSave": "Saving file",
  "exportPdf.phaseDone": "Done",
  "exportMarkdown.title": "Exporting Markdown",
  "exportMarkdown.phasePrepare": "Preparing",
  "exportMarkdown.phaseRender": "Processing content",
  "exportMarkdown.phaseImages": "Copying images",
  "exportMarkdown.phaseGenerate": "Packaging",
  "exportMarkdown.phaseSave": "Saving file",
  "exportMarkdown.phaseDone": "Done",
  "exportZip.title": "Exporting ZIP",
  "exportZip.phasePrepare": "Preparing",
  "exportZip.phaseRender": "Processing content",
  "exportZip.phaseImages": "Copying images",
  "exportZip.phaseGenerate": "Compressing",
  "exportZip.phaseSave": "Saving archive",
  "exportZip.phaseDone": "Done",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.languageHint": "Choose the interface language.",
  "settings.font": "Font",
  "settings.fontHint": "Choose the interface and editor font. Handwriting fonts are bundled in the app (OFL license).",
  "settings.fontMicrosoftYaHei": "Microsoft YaHei",
  "settings.fontYozai": "Yozai (handwriting)",
  "settings.fontXiaolai": "Xiaolai (handwriting)",
  "settings.localStorage": "Local storage",
  "settings.localStorageHint": "Notes are stored in a local folder. Edit the path or pick a folder.",
  "settings.shortcuts": "Keyboard shortcuts",
  "settings.shortcutsHint": "Use formats like Ctrl+Shift+F or Shift+Shift (double-tap Shift). Press Enter or blur to save.",
  "settings.shortcutsReset": "Reset to defaults",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.notes": "Notes",
  "settings.markdownSaveMode": "Note & drawing save mode",
  "settings.markdownSaveModeHint":
    "Applies to Markdown notes and Excalidraw drawings. Default is autosave every 15 seconds plus Ctrl+S / ⌘S. Realtime save writes to disk shortly after each edit.",
  "settings.markdownSaveModeRealtime": "Realtime save",
  "settings.markdownSaveModeInterval": "Every 15s autosave",
  "settings.deleteImageFilesOnRemove": "Delete image files when removed from notes",
  "settings.deleteImageFilesOnRemoveHint":
    "When enabled, removing an image from a note also deletes the file in its _pic folder, unless another note still references it.",
  "settings.keepNetworkImageLinks": "Keep network image links",
  "settings.keepNetworkImageLinksHint":
    "When on (default), https image URLs stay in the note and are not copied into _pic. Exporting Markdown still downloads them into the export folder.",
  "settings.plugins": "Plugins",
  "settings.pluginsHint":
    "Select one to load; click it again to unload it from memory. Uninstall removes it from disk.",
  "settings.pluginsEmpty": "No plugins imported yet.",
  "settings.pluginsDrop": "Drop a plugin .zip here, or click to choose",
  "settings.pluginsDropHint": "Use the pack from Chestnut Cat (manifest.json + widget assets).",
  "settings.pluginsNeedZip": "Please import a .zip plugin pack.",
  "settings.pluginsPath": "Plugins folder: {path}",
  "settings.pluginsZipUsePicker": "This zip is too large to drop. Click the box and choose the file instead.",
  "settings.pluginsUninstall": "Uninstall",
  "settings.pluginsUninstallTitle": "Uninstall plugin",
  "settings.pluginsUninstallMessage": "Remove {name} from the editor plugins folder? You can import the zip again later.",
  "sidebar.navAria": "Sidebar actions",
  "sidebar.newNote": "New Markdown note",
  "sidebar.newDrawing": "New Excalidraw drawing",
  "sidebar.newFolder": "New folder",
  "sidebar.resizeAria": "Resize file sidebar",
  "sidebar.collapseAria": "Collapse file sidebar",
  "sidebar.expandAria": "Expand file sidebar to default width",
  "outline.resizeAria": "Resize outline panel",
  "outline.collapseAria": "Collapse outline panel",
  "outline.expandAria": "Expand outline panel to default width",
  "tab.note": "Note",
  "tab.drawing": "Drawing",
  "tab.image": "Image",
  "tab.pdf": "PDF",
  "tab.graph": "Graph",
  "tab.settings": "Settings",
  "tab.publish": "Publish",
  "tab.welcome": "Welcome",
  "tab.close": "Close",
  "tab.closeOthers": "Close others",
  "tab.closeToLeft": "Close all to the left",
  "tab.closeToRight": "Close all to the right",
  "tab.closeAll": "Close all",
  "tab.refresh": "Refresh",
  "tab.refreshUnsavedTitle": "Unsaved changes",
  "tab.refreshUnsavedMessage": "This file has unsaved changes. Reload from disk and discard them?",
  "tab.refreshUnsavedConfirm": "Refresh",
  "tab.closeUnsavedTitle": "Unsaved changes",
  "tab.closeUnsavedMessage": "This file has unsaved changes. Close it anyway?",
  "tab.closeUnsavedMultipleMessage": "{count} files have unsaved changes. Close them anyway?",
  "tab.closeUnsavedConfirm": "Close",
  "tab.unsavedAria": "Unsaved changes",
  "tab.splitDropHint": "Release to enter split view",
  "note.modeLive": "Live",
  "note.modeSource": "Source",
  "note.modeSwitchAria": "Editor mode",
  "note.saveSaved": "File content saved",
  "note.saveAutosaved": "File content autosaved",
  "note.saveRealtime": "File content uses realtime save",
  "note.saveUnsaved": "File content not saved",
  "note.viewOnly": "Only view",
  "note.viewOnlyAria": "Toggle view-only mode",
  "note.untitledPlaceholder": "Untitled note",
  "note.titleAria": "Note title",
  "note.loading": "Loading…",
  "note.outlineTitle": "Outline",
  "note.outlineEmpty": "No headings",
  "note.editorLivePlaceholder": "Start writing — rendered live…",
  "note.editorSourcePlaceholder": "Start writing Markdown…",
  "note.editorContextMenuCopy": "Copy",
  "note.editorContextMenuCopyMarkdown": "Copy as Markdown",
  "note.editorContextMenuCopyPlain": "Copy as plain text",
  "note.editorContextMenuPaste": "Paste",
  "note.editorContextMenuTable": "Table",
  "note.tableToolbarRowAbove": "Insert row above",
  "note.tableToolbarRowBelow": "Insert row below",
  "note.tableToolbarDeleteRow": "Delete row",
  "note.tableToolbarColLeft": "Insert column left",
  "note.tableToolbarColRight": "Insert column right",
  "note.tableToolbarDeleteCol": "Delete column",
  "note.tableToolbarAlignLeft": "Align column left",
  "note.tableToolbarAlignCenter": "Align column center",
  "note.tableToolbarAlignRight": "Align column right",
  "note.tableToolbarSum": "Sum",
  "note.tableToolbarAverage": "Average",
  "note.tableToolbarDeleteTable": "Delete entire table",
  "note.editorContextMenuCode": "Code",
  "note.editorContextMenuMath": "Math",
  "note.editorContextMenuTaskList": "Task List",
  "note.deleteImageTitle": "Remove image",
  "note.deleteImageConfirm": "Remove “{name}” from this note?",
  "note.deleteImageConfirmFileHint":
    "If this image is not referenced elsewhere, the file in its _pic folder will also be deleted.",
  "note.deleteImageAction": "Remove from note",
  "note.editImageCaption": "Add description",
  "note.zoomImageAction": "Zoom image",
  "note.pinImageAction": "Floating pin",
  "note.imageCaptionPlaceholder": "Add description…",
  "fileTree.rename": "Rename",
  "fileTree.delete": "Delete",
  "fileTree.deleteFolder": "Delete folder",
  "fileTree.deleteFiles": "Delete files",
  "fileTree.deleteFolders": "Delete folders",
  "fileTree.deleteItems": "Delete multiple",
  "fileTree.newNote": "New note",
  "fileTree.newDrawing": "New drawing",
  "fileTree.newFolder": "New folder",
  "fileTree.renameFolderAria": "Rename folder",
  "fileTree.renameFileAria": "Rename file",
  "fileTree.picFolderLocked": "Image folder — manage in your system file manager",
  "fileTree.exportTargetFolderLocked": "Export folder — files are added automatically when you export",
  "fileTree.deleteConfirm": "Move “{name}” to the Recycle Bin? You can restore it later from the system Recycle Bin.",
  "fileTree.deleteNoteConfirm": "Move “{name}” to the Recycle Bin? The associated image folder “{picFolder}” will also be moved to the Recycle Bin. You can restore them later from the system Recycle Bin.",
  "fileTree.deleteFilesConfirm": "Move {count} files to the Recycle Bin? You can restore them later from the system Recycle Bin.",
  "fileTree.deleteFoldersConfirm": "Move {count} folders to the Recycle Bin? You can restore them later from the system Recycle Bin.",
  "fileTree.deleteMixedConfirm": "Move {fileCount} files and {folderCount} folders to the Recycle Bin? You can restore them later from the system Recycle Bin.",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.delete": "Delete",
  "fileTree.currentFolder": "Current folder",
  "fileTree.collapseAll": "Collapse all folders",
  "fileTree.collapseAllAria": "Collapse all folders in the file tree",
  "fileTree.expandFolder": "Expand folder",
  "fileTree.collapseFolder": "Collapse folder",
  "fileTree.revealActiveFile": "Reveal active file",
  "fileTree.showPicFolders": "Show _pic image folders",
  "fileTree.hidePicFolders": "Hide _pic image folders",
  "fileTree.revealInFileManager": "Reveal in file manager",
  "fileTree.copyFile": "Copy",
  "fileTree.copyPath": "Copy path",
  "fileTree.paste": "Paste",
  "fileTree.exportPdf": "Export as PDF",
  "fileTree.exportMarkdown": "Export as Markdown",
  "fileTree.exportZip": "Export as ZIP",
  "fileTree.moveFailed": "Failed to move item.",
  "fileTree.pin": "Pin",
  "fileTree.unpin": "Unpin",
  "fileTree.pinned": "Pinned area",
  "palette.quickOpenPlaceholder": "Quick open…",
  "palette.searchPlaceholder": "Search notes…",
  "palette.deleteFile": "Delete file",
  "palette.deleteFileAria": "Delete {name}",
  "palette.noResults": "No results",
  "publish.title": "Publish",
  "publish.hint": "Notes with publish: true in frontmatter can be exported as static HTML + RSS.",
  "publish.listTitle": "Publishable notes ({count})",
  "publish.generate": "Generate site",
  "publish.download": "Download bundle",
  "publish.previewTitle": "HTML preview",
  "publish.rssTitle": "RSS",
  "excalidraw.loading": "Loading drawing…",
  "excalidraw.loadingApp": "Loading Excalidraw…",
  "image.loading": "Loading image…",
  "image.loadFailed": "Failed to load “{name}”.",
  "pdf.loading": "Loading PDF…",
  "pdf.loadFailed": "Failed to load “{name}”.",
  "error.title": "Something went wrong",
  "error.hint": "Try reloading the app. If the problem persists, check the console for details.",
  "commands.newNote": "New note",
  "commands.newDrawing": "New Excalidraw drawing",
  "commands.openGraph": "Open graph view",
  "commands.openSettings": "Open settings",
  "commands.openPublish": "Open publish panel",
  "commands.toggleSource": "Toggle source mode",
  "commands.category": "Chestnut",
  "shortcuts.quick-open": "Quick open",
  "shortcuts.search": "Full-text search",
  "shortcuts.md-bold": "Bold",
  "shortcuts.md-italic": "Italic",
  "shortcuts.md-underline": "Underline",
  "shortcuts.md-strikethrough": "Strikethrough",
  "shortcuts.md-highlight": "Highlight",
  "shortcuts.md-heading-1": "Heading 1",
  "shortcuts.md-heading-2": "Heading 2",
  "shortcuts.md-heading-3": "Heading 3",
  "shortcuts.md-heading-4": "Heading 4",
  "shortcuts.md-heading-5": "Heading 5",
  "shortcuts.md-heading-6": "Heading 6",
  "shortcuts.md-prev-heading": "Previous heading",
  "shortcuts.md-next-heading": "Next heading",
  "shortcuts.md-task-list": "Task list",
  "shortcuts.md-code-block": "Code block",
  "shortcuts.md-table": "Insert table",
  "shortcuts.md-editor-zoom": "Editor zoom",
  "settings.editorShortcuts": "Markdown editor shortcuts",
  "settings.editorShortcutsHint": "Shortcuts below apply while editing notes. Use formats like Ctrl+B or Ctrl+Wheel. Heading navigation and zoom cannot be customized.",
  "settings.editorShortcutsReset": "Reset editor shortcuts",
  "settings.shortcutFixedHint": "This shortcut is fixed and cannot be changed",
  "note.editorZoomHint": "{percent}%",
};

const zhCN: MessageTable = {
  "vault.loading": "正在打开知识库…",
  "vault.desktopOnly": "本地文件夹选择仅在桌面版可用。",
  "vault.pathAria": "知识库路径",
  "vault.pathPlaceholder": "输入知识库文件夹路径",
  "welcome.hint": "选择文件或新建笔记。",
  "welcome.newNote": "新建笔记",
  "toolbar.quickOpen": "快速打开",
  "toolbar.search": "搜索",
  "toolbar.settings": "设置",
  "toolbar.quickOpenTooltip": "快速打开（{shortcut}）",
  "toolbar.searchTooltip": "搜索笔记（{shortcut}）",
  "toolbar.settingsTooltip": "打开设置",
  "toolbar.importMarkdownTooltip": "导入 Markdown 文件夹（自动转为笔记 + _pic）",
  "toolbar.alwaysOnTopOffTooltip": "窗口置顶（已关闭）",
  "toolbar.alwaysOnTopOnTooltip": "窗口置顶（已开启）",
  "toolbar.splitOffTooltip": "左右分屏",
  "toolbar.splitOnTooltip": "退出分屏",
  "toolbar.pickFolder": "选择文件夹",
  "toolbar.pickFolderAria": "选择知识库文件夹",
  "toolbar.copyVaultPath": "复制路径",
  "toolbar.copyVaultPathAria": "复制知识库路径",
  "toolbar.vaultPathAria": "知识库路径",
  "toolbar.vaultPathHint": "知识库：{path}",
  "toolbar.vaultPathPickHint": "点击选择文件夹 — {path}",
  "status.ready": "就绪",
  "status.pickFolderFailed": "打开文件夹选择器失败。",
  "status.vaultPathInvalid": "知识库路径无效。",
  "status.vaultPathCopied": "路径已复制。",
  "status.fileCopied": "文件已复制。",
  "status.copyFailed": "复制到剪贴板失败。",
  "status.copyFileDesktopOnly": "复制文件需要使用桌面版。",
  "status.pasteSuccess": "已粘贴 {count} 项。",
  "status.pasteFailed": "粘贴失败。",
  "status.pasteEmpty": "剪贴板中没有可粘贴的文件。",
  "status.pasteDesktopOnly": "粘贴文件需要使用桌面版。",
  "status.pasteNotAllowedHere": "无法粘贴到此文件夹。",
  "status.exportPdfFailed": "导出 PDF 失败。",
  "status.exportMarkdownFailed": "导出 Markdown 失败。",
  "status.exportZipFailed": "导出 ZIP 失败。",
  "status.revealInFileManagerFailed": "在文件管理器中打开失败。",
  "status.exportPdfSuccess": "已导出并打开 PDF：{path}",
  "status.exportMarkdownSuccess": "已导出 Markdown：{path}",
  "status.exportZipSuccess": "已导出 ZIP：{path}",
  "status.importMarkdownFailed": "导入 Markdown 文件夹失败。",
  "status.importMarkdownSuccess": "已导入 Markdown 笔记：{path}",
  "status.alwaysOnTopFailed": "切换窗口置顶失败。",
  "status.pinImageFailed": "图片置顶失败。",
  "exportPdf.title": "正在导出 PDF",
  "exportPdf.phasePrepare": "准备中",
  "exportPdf.phaseRender": "渲染内容",
  "exportPdf.phaseImages": "加载图片",
  "exportPdf.phaseGenerate": "生成 PDF",
  "exportPdf.phaseSave": "保存文件",
  "exportPdf.phaseDone": "完成",
  "exportMarkdown.title": "正在导出 Markdown",
  "exportMarkdown.phasePrepare": "准备中",
  "exportMarkdown.phaseRender": "处理内容",
  "exportMarkdown.phaseImages": "复制图片",
  "exportMarkdown.phaseGenerate": "打包中",
  "exportMarkdown.phaseSave": "保存文件",
  "exportMarkdown.phaseDone": "完成",
  "exportZip.title": "正在导出 ZIP",
  "exportZip.phasePrepare": "准备中",
  "exportZip.phaseRender": "处理内容",
  "exportZip.phaseImages": "复制图片",
  "exportZip.phaseGenerate": "压缩中",
  "exportZip.phaseSave": "保存压缩包",
  "exportZip.phaseDone": "完成",
  "settings.title": "设置",
  "settings.language": "语言",
  "settings.languageHint": "选择界面显示语言。",
  "settings.font": "字体",
  "settings.fontHint": "选择界面与编辑器的字体。手写体已内置在应用中（OFL 开源许可）。",
  "settings.fontMicrosoftYaHei": "微软雅黑",
  "settings.fontYozai": "悠哉体（手写）",
  "settings.fontXiaolai": "小赖体（手写）",
  "settings.localStorage": "本地存储",
  "settings.localStorageHint": "笔记保存在本地文件夹，可直接编辑路径或点击右侧图标选择文件夹。",
  "settings.shortcuts": "快捷键",
  "settings.shortcutsHint": "使用类似 Ctrl+Shift+F、Shift+Shift（双击 Shift）的格式，修改后按 Enter 或点击其他区域保存。",
  "settings.shortcutsReset": "恢复默认",
  "settings.theme": "主题",
  "settings.themeLight": "浅色",
  "settings.themeDark": "深色",
  "settings.notes": "笔记",
  "settings.markdownSaveMode": "笔记与绘图保存方式",
  "settings.markdownSaveModeHint":
    "同时适用于 Markdown 笔记与 Excalidraw 绘图。默认为每 15 秒自动保存，也可按 Ctrl+S / ⌘S 手动保存。实时保存会在每次编辑后很快写入磁盘。",
  "settings.markdownSaveModeRealtime": "实时保存",
  "settings.markdownSaveModeInterval": "每 15 秒自动保存",
  "settings.deleteImageFilesOnRemove": "从笔记移除图片时同步删除图片文件",
  "settings.deleteImageFilesOnRemoveHint":
    "开启后，从笔记中移除图片时会删除对应 _pic 文件夹中的文件；若其他笔记仍引用该图片则不会删除。",
  "settings.keepNetworkImageLinks": "保留网络图片链接",
  "settings.keepNetworkImageLinksHint":
    "默认开启：保存时不把网络图片下载到笔记 _pic，笔记迁移也不处理这些链接。导出为 Markdown 时仍会下载到导出目录并改成相对路径。",
  "settings.plugins": "插件",
  "settings.pluginsHint": "点选加载，再点一次从内存卸载。卸载按钮会删除安装目录中的插件文件。",
  "settings.pluginsEmpty": "还没有导入插件。",
  "settings.pluginsDrop": "将插件 zip 拖到这里，或点击选择",
  "settings.pluginsDropHint": "请使用 Chestnut Cat 打好的插件包（含 manifest.json 与贴图）。",
  "settings.pluginsNeedZip": "请导入 .zip 插件包。",
  "settings.pluginsPath": "插件目录：{path}",
  "settings.pluginsZipUsePicker": "这个 zip 太大，无法直接拖入。请点击虚线框选择文件。",
  "settings.pluginsUninstall": "卸载",
  "settings.pluginsUninstallTitle": "卸载插件",
  "settings.pluginsUninstallMessage": "要从编辑器 plugins 目录删除 {name} 吗？之后可以再导入 zip。",
  "sidebar.navAria": "侧边栏操作",
  "sidebar.newNote": "新建 Markdown 笔记",
  "sidebar.newDrawing": "新建 Excalidraw 绘图",
  "sidebar.newFolder": "新建文件夹",
  "sidebar.resizeAria": "拖动调整文件栏宽度",
  "sidebar.collapseAria": "收起文件列表",
  "sidebar.expandAria": "展开文件列表至默认宽度",
  "outline.resizeAria": "拖动调整目录宽度",
  "outline.collapseAria": "收起目录",
  "outline.expandAria": "展开目录至默认宽度",
  "tab.note": "笔记",
  "tab.drawing": "绘图",
  "tab.image": "图片",
  "tab.pdf": "PDF",
  "tab.graph": "图谱",
  "tab.settings": "设置",
  "tab.publish": "发布",
  "tab.welcome": "欢迎",
  "tab.close": "关闭",
  "tab.closeOthers": "关闭其他",
  "tab.closeToLeft": "关闭左侧所有",
  "tab.closeToRight": "关闭右侧所有",
  "tab.closeAll": "关闭所有",
  "tab.refresh": "刷新",
  "tab.refreshUnsavedTitle": "未保存的更改",
  "tab.refreshUnsavedMessage": "当前文件内容未保存，是否从磁盘重新加载并丢弃未保存更改？",
  "tab.refreshUnsavedConfirm": "刷新",
  "tab.closeUnsavedTitle": "未保存的更改",
  "tab.closeUnsavedMessage": "当前文件内容未保存，是否关闭？",
  "tab.closeUnsavedMultipleMessage": "有 {count} 个文件内容未保存，是否关闭？",
  "tab.closeUnsavedConfirm": "关闭",
  "tab.unsavedAria": "未保存",
  "tab.splitDropHint": "松手进入双屏",
  "note.modeLive": "实时",
  "note.modeSource": "源码",
  "note.modeSwitchAria": "编辑模式",
  "note.saveSaved": "文件内容已保存",
  "note.saveAutosaved": "文件内容已自动保存",
  "note.saveRealtime": "文件内容已采用实时保存",
  "note.saveUnsaved": "文件内容未保存",
  "note.viewOnly": "仅查看",
  "note.viewOnlyAria": "切换仅查看模式",
  "note.untitledPlaceholder": "未命名笔记",
  "note.titleAria": "笔记标题",
  "note.loading": "加载中…",
  "note.outlineTitle": "目录",
  "note.outlineEmpty": "暂无标题",
  "note.editorLivePlaceholder": "输入内容，实时渲染…",
  "note.editorSourcePlaceholder": "开始书写 Markdown…",
  "note.editorContextMenuCopy": "复制",
  "note.editorContextMenuCopyMarkdown": "复制为 Markdown",
  "note.editorContextMenuCopyPlain": "复制为纯文本",
  "note.editorContextMenuPaste": "粘贴",
  "note.editorContextMenuTable": "表格",
  "note.tableToolbarRowAbove": "上方插入行",
  "note.tableToolbarRowBelow": "下方插入行",
  "note.tableToolbarDeleteRow": "删除行",
  "note.tableToolbarColLeft": "左侧插入列",
  "note.tableToolbarColRight": "右侧插入列",
  "note.tableToolbarDeleteCol": "删除列",
  "note.tableToolbarAlignLeft": "列左对齐",
  "note.tableToolbarAlignCenter": "列居中对齐",
  "note.tableToolbarAlignRight": "列右对齐",
  "note.tableToolbarSum": "求和",
  "note.tableToolbarAverage": "求平均值",
  "note.tableToolbarDeleteTable": "删除整个表格",
  "note.editorContextMenuCode": "代码",
  "note.editorContextMenuMath": "公式",
  "note.editorContextMenuTaskList": "任务列表",
  "note.deleteImageTitle": "移除图片",
  "note.deleteImageConfirm": "从笔记中移除「{name}」？",
  "note.deleteImageConfirmFileHint": "若该图片未被其他笔记引用，对应 _pic 文件夹中的图片文件也会被删除。",
  "note.deleteImageAction": "从笔记移除",
  "note.editImageCaption": "添加描述",
  "note.zoomImageAction": "放大预览",
  "note.pinImageAction": "图钉悬浮",
  "note.imageCaptionPlaceholder": "添加描述…",
  "fileTree.rename": "重命名",
  "fileTree.delete": "删除",
  "fileTree.deleteFolder": "删除文件夹",
  "fileTree.deleteFiles": "删除文件",
  "fileTree.deleteFolders": "删除文件夹",
  "fileTree.deleteItems": "删除多项",
  "fileTree.newNote": "新建笔记",
  "fileTree.newDrawing": "新建绘图",
  "fileTree.newFolder": "新建文件夹",
  "fileTree.renameFolderAria": "重命名文件夹",
  "fileTree.renameFileAria": "重命名文件",
  "fileTree.picFolderLocked": "图片文件夹 — 请在系统文件管理器中管理",
  "fileTree.exportTargetFolderLocked": "导出目录 — 导出时由应用自动写入",
  "fileTree.deleteConfirm": "确定将「{name}」移到回收站？之后仍可从系统回收站中恢复。",
  "fileTree.deleteNoteConfirm": "确定将「{name}」移到回收站？关联的图片文件夹「{picFolder}」也会一并移入回收站，之后仍可从系统回收站中恢复。",
  "fileTree.deleteFilesConfirm": "确定将 {count} 个文件移到回收站？之后仍可从系统回收站中恢复。",
  "fileTree.deleteFoldersConfirm": "确定将 {count} 个文件夹移到回收站？之后仍可从系统回收站中恢复。",
  "fileTree.deleteMixedConfirm": "确定将 {fileCount} 个文件和 {folderCount} 个文件夹移到回收站？之后仍可从系统回收站中恢复。",
  "common.cancel": "取消",
  "common.confirm": "确定",
  "common.delete": "删除",
  "fileTree.currentFolder": "当前文件夹",
  "fileTree.collapseAll": "折叠所有目录",
  "fileTree.collapseAllAria": "折叠文件树中的所有目录",
  "fileTree.expandFolder": "展开文件夹",
  "fileTree.collapseFolder": "折叠文件夹",
  "fileTree.revealActiveFile": "定位当前文件",
  "fileTree.showPicFolders": "显示 _pic 图片文件夹",
  "fileTree.hidePicFolders": "隐藏 _pic 图片文件夹",
  "fileTree.revealInFileManager": "在文件管理器中打开",
  "fileTree.copyFile": "复制",
  "fileTree.copyPath": "复制路径",
  "fileTree.paste": "粘贴",
  "fileTree.exportPdf": "导出为 PDF",
  "fileTree.exportMarkdown": "导出为 Markdown",
  "fileTree.exportZip": "导出为 ZIP",
  "fileTree.moveFailed": "移动失败。",
  "fileTree.pin": "置于顶部",
  "fileTree.unpin": "取消置于顶部",
  "fileTree.pinned": "置顶区域",
  "palette.quickOpenPlaceholder": "快速打开…",
  "palette.searchPlaceholder": "搜索笔记…",
  "palette.deleteFile": "删除文件",
  "palette.deleteFileAria": "删除 {name}",
  "palette.noResults": "无结果",
  "publish.title": "发布",
  "publish.hint": "在 frontmatter 中设置 publish: true 的笔记可导出为静态 HTML + RSS。",
  "publish.listTitle": "可发布笔记（{count}）",
  "publish.generate": "生成站点",
  "publish.download": "下载打包",
  "publish.previewTitle": "HTML 预览",
  "publish.rssTitle": "RSS",
  "excalidraw.loading": "加载绘图中…",
  "excalidraw.loadingApp": "加载 Excalidraw…",
  "image.loading": "加载图片中…",
  "image.loadFailed": "无法加载「{name}」。",
  "pdf.loading": "加载 PDF 中…",
  "pdf.loadFailed": "无法加载「{name}」。",
  "error.title": "出错了",
  "error.hint": "请尝试重新加载应用。若问题持续，请查看控制台日志。",
  "commands.newNote": "新建笔记",
  "commands.newDrawing": "新建 Excalidraw 绘图",
  "commands.openGraph": "打开图谱",
  "commands.openSettings": "打开设置",
  "commands.openPublish": "打开发布面板",
  "commands.toggleSource": "切换源码模式",
  "commands.category": "Chestnut",
  "shortcuts.quick-open": "快速打开",
  "shortcuts.search": "全文搜索",
  "shortcuts.md-bold": "加粗",
  "shortcuts.md-italic": "斜体",
  "shortcuts.md-underline": "下划线",
  "shortcuts.md-strikethrough": "删除线",
  "shortcuts.md-highlight": "高亮",
  "shortcuts.md-heading-1": "标题 1",
  "shortcuts.md-heading-2": "标题 2",
  "shortcuts.md-heading-3": "标题 3",
  "shortcuts.md-heading-4": "标题 4",
  "shortcuts.md-heading-5": "标题 5",
  "shortcuts.md-heading-6": "标题 6",
  "shortcuts.md-prev-heading": "上一个标题",
  "shortcuts.md-next-heading": "下一个标题",
  "shortcuts.md-task-list": "任务列表",
  "shortcuts.md-code-block": "代码块",
  "shortcuts.md-table": "插入表格",
  "shortcuts.md-editor-zoom": "编辑器缩放",
  "settings.editorShortcuts": "Markdown 编辑器快捷键",
  "settings.editorShortcutsHint": "以下快捷键在编辑笔记时生效。可使用 Ctrl+B、Ctrl+Wheel 等格式。标题跳转与编辑器缩放不可修改。",
  "settings.editorShortcutsReset": "恢复编辑器快捷键默认",
  "settings.shortcutFixedHint": "此快捷键固定，不可修改",
  "note.editorZoomHint": "{percent}%",
};

export const MESSAGES: Record<Locale, MessageTable> = { en, "zh-CN": zhCN };

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const table = MESSAGES[locale] ?? MESSAGES.en;
  const text = table[key] ?? MESSAGES.en[key] ?? key;
  return interpolate(text, params);
}

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  return "en";
}

export function applyDocumentLang(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}

const README_EN = `# Welcome to Chestnut Editor

Chestnut Editor is a personal Markdown and Excalidraw editor. Your notes and drawings live as plain files in a folder you control.

## Get started

1. Click **New note** in the sidebar to write Markdown.
2. Click **New drawing** to create an Excalidraw canvas.
3. Organize files and folders in the file tree on the left.

## Your data

- Notes are \`.md\` files; drawings are \`.excalidraw\` files.
- Pasted images are saved next to each note in a \`{NoteName}_pic/\` folder.
- The vault path in the toolbar shows where files are stored.

Start writing your first note here.
`;

const README_ZH = `# 欢迎使用 Chestnut Editor

Chestnut Editor 是一款面向个人的 Markdown 与 Excalidraw 编辑器，笔记与绘图都以普通文件保存在你指定的文件夹中。

## 快速开始

1. 在左侧点击 **新建笔记**，写下第一篇 Markdown。
2. 点击 **新建绘图**，创建 Excalidraw 画板。
3. 在文件树中整理文件夹与文件。

## 关于你的数据

- 笔记为 \`.md\` 文件，绘图为 \`.excalidraw\` 文件。
- 粘贴的图片保存在笔记旁的 \`{笔记名}_pic/\` 文件夹中。
- 顶部工具栏显示当前知识库路径。

从这里开始，写下属于你的第一条笔记吧。
`;

const MERMAID_DEMO = `# Mermaid Demo

In **Live** mode, \`mermaid\` code blocks below should render as diagrams.

## Flowchart

\`\`\`mermaid
flowchart TD
  A[Start] --> B{Need a test?}
  B -->|Yes| C[Open this note]
  B -->|No| D[Write something else]
  C --> E[Check the diagram]
  E --> F[Done]
  D --> F
\`\`\`

## Sequence

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant E as Chestnut
  participant M as Mermaid
  U->>E: Open Live mode
  E->>M: renderPreview(mermaid)
  M-->>E: SVG
  E-->>U: Show diagram
\`\`\`

## Class diagram

\`\`\`mermaid
classDiagram
  class Note {
    +string path
    +string content
    +save()
  }
  class Editor {
    +open(Note)
    +renderMermaid()
  }
  Editor --> Note : edits
\`\`\`

## Pie chart

\`\`\`mermaid
pie showData
  title Checklist
  "Flowchart" : 40
  "Sequence" : 30
  "Class" : 20
  "Pie" : 10
\`\`\`
`;

export function getDefaultReadmeEnContent(): string {
  return README_EN;
}

export function getDefaultReadmeCnContent(): string {
  return README_ZH;
}

export function getDefaultReadmeContent(locale: Locale): string {
  return locale === "zh-CN" ? README_ZH : README_EN;
}

export function getDefaultMermaidDemoContent(): string {
  return MERMAID_DEMO;
}
