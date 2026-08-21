export { RemoteRestAdapter, type RemoteConfig } from "./remote.js";
export {
  TauriFsAdapter,
  isTauri,
  openVaultFolderInExplorer,
  openExternalUrl,
  revealVaultEntry,
  writeClipboardFiles,
  readClipboardFiles,
  hasClipboardFiles,
  copyPathsIntoDir,
  pickFolder,
  listDirectory,
  readExternalText,
  readExternalBinary,
  externalPathExists,
  type ExternalFsEntry,
} from "./tauri.js";
