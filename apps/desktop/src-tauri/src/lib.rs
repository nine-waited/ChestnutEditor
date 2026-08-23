use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Serialize, Deserialize)]
struct PinImagePayload {
    src: String,
    alt: String,
}

fn pin_image_payloads() -> &'static Mutex<HashMap<String, PinImagePayload>> {
    static STORE: OnceLock<Mutex<HashMap<String, PinImagePayload>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
fn store_pin_image_payload(id: String, src: String, alt: Option<String>) -> Result<(), String> {
    let mut map = pin_image_payloads().lock().map_err(|e| e.to_string())?;
    map.insert(
        id,
        PinImagePayload {
            src,
            alt: alt.unwrap_or_default(),
        },
    );
    Ok(())
}

#[tauri::command]
fn take_pin_image_payload(id: String) -> Result<PinImagePayload, String> {
    let mut map = pin_image_payloads().lock().map_err(|e| e.to_string())?;
    map.remove(&id)
        .ok_or_else(|| "pin payload not found".to_string())
}

#[derive(Serialize)]
struct VaultEntry {
    path: String,
    name: String,
    kind: String,
    size: Option<u64>,
    #[serde(rename = "mtimeMs")]
    mtime_ms: Option<u64>,
}

fn normalize_rel(path: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for comp in Path::new(path).components() {
        match comp {
            Component::Normal(p) => out.push(p),
            Component::ParentDir => return Err("path traversal".into()),
            Component::RootDir | Component::Prefix(_) => return Err("absolute path".into()),
            Component::CurDir => {}
        }
    }
    Ok(out)
}

fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(root);
    let rel = normalize_rel(rel)?;
    Ok(base.join(rel))
}

fn home_dir() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE")
            .map(PathBuf::from)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME")
            .map(PathBuf::from)
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn default_vault_path() -> Result<String, String> {
    let path = home_dir()?.join(".chestnut");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_vault_folder(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file();
    if let Some(default_path) = default_path {
        let path = PathBuf::from(default_path);
        let start = if path.is_dir() {
            path.canonicalize().unwrap_or(path)
        } else {
            path.parent()
                .filter(|p| p.is_dir())
                .map(|p| p.canonicalize().unwrap_or_else(|_| p.to_path_buf()))
                .unwrap_or(path)
        };
        if start.is_dir() {
            dialog = dialog.set_directory(start);
        }
    }

    let folder = dialog.blocking_pick_folder();
    folder
        .map(|p| p.to_string())
        .ok_or_else(|| "cancelled".into())
}

#[derive(Serialize)]
struct FsEntry {
    name: String,
    kind: String,
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FsEntry>, String> {
    let target = PathBuf::from(&path);
    if !target.is_dir() {
        return Err(format!("not a directory: {}", path));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        entries.push(FsEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            kind: if meta.is_dir() {
                "directory"
            } else {
                "file"
            }
            .into(),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn vault_read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_read_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_write_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = format!("{}.tmp", path);
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_write_binary(path: String, content: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = format!("{}.tmp", path);
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_delete(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_rename(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
fn vault_list(root: String, dir: String) -> Result<Vec<VaultEntry>, String> {
    let target = if dir.is_empty() {
        PathBuf::from(&root)
    } else {
        resolve(&root, &dir)?
    };
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&target).map_err(|e| e.to_string())?;
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = if dir.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", dir.replace('\\', "/"), name)
        };
        entries.push(VaultEntry {
            path: rel,
            name,
            kind: if meta.is_dir() { "directory" } else { "file" }.into(),
            size: if meta.is_file() {
                Some(meta.len())
            } else {
                None
            },
            mtime_ms: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
        });
    }
    entries.sort_by(|a, b| {
        if a.kind != b.kind {
            return a.kind.cmp(&b.kind);
        }
        a.name.cmp(&b.name)
    });
    Ok(entries)
}

#[cfg(target_os = "windows")]
fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = raw.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

fn open_path_in_explorer(path: PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("path not found: {}", path.display()));
    }
    let path = strip_verbatim_prefix(path.canonicalize().map_err(|e| e.to_string())?);

    #[cfg(not(target_os = "windows"))]
    {
        if path.is_file() {
            opener::reveal(&path).map_err(|e| e.to_string())?;
        } else {
            opener::open(&path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    open_in_windows_explorer(&path)
}

#[cfg(target_os = "windows")]
fn open_in_windows_explorer(path: &Path) -> Result<(), String> {
    use std::process::Command;

    // Folder open uses `explorer <path>` and works reliably. File `/select,` parsing
    // is brittle on Windows, so reveal files by opening their parent directory instead.
    let target = if path.is_file() {
        path.parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or(path)
    } else {
        path
    };

    Command::new("explorer")
        .arg(target)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn open_vault_folder(path: String) -> Result<(), String> {
    open_path_in_explorer(PathBuf::from(path))
}

/// Open http(s) URLs in the OS default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("only http(s) urls are allowed".into());
    }
    if trimmed.contains(['\n', '\r', '\0']) {
        return Err("invalid url".into());
    }
    opener::open(trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_vault_entry(vault_root: String, entry_path: Option<String>) -> Result<(), String> {
    let path = match entry_path.filter(|entry| !entry.is_empty()) {
        Some(rel) => resolve(&vault_root, &rel)?,
        None => PathBuf::from(vault_root),
    };
    open_path_in_explorer(path)
}

/// Put absolute file paths on the OS clipboard as CF_HDROP so Explorer can paste them.
#[tauri::command]
fn clipboard_write_files(paths: Vec<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        use clipboard_win::{formats, Clipboard, Setter};

        if paths.is_empty() {
            return Err("no files to copy".into());
        }

        let mut native_paths = Vec::with_capacity(paths.len());
        for path in &paths {
            let pb = PathBuf::from(path);
            if !pb.exists() {
                return Err(format!("path not found: {path}"));
            }
            let native = pb
                .canonicalize()
                .map_err(|e| format!("canonicalize {path}: {e}"))?;
            let mut s = native.to_string_lossy().to_string();
            // Strip Windows extended path prefix so shell paste stays compatible.
            if let Some(stripped) = s.strip_prefix(r"\\?\") {
                s = stripped.to_string();
            }
            native_paths.push(s);
        }

        let _clip = Clipboard::new_attempts(10).map_err(|code| format!("open clipboard: {code}"))?;
        formats::FileList
            .write_clipboard(&native_paths)
            .map_err(|code| format!("clipboard write files failed: {code}"))?;
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = paths;
        Err("copying files to the clipboard is only supported on Windows".into())
    }
}

fn strip_extended_path_prefix(path: String) -> String {
    if let Some(stripped) = path.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        path
    }
}

/// Read absolute file/folder paths from the OS clipboard (CF_HDROP). Empty when none.
#[tauri::command]
fn clipboard_read_files() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use clipboard_win::{formats, Clipboard, Getter};

        let _clip = match Clipboard::new_attempts(10) {
            Ok(clip) => clip,
            Err(_) => return Ok(Vec::new()),
        };
        let mut paths = Vec::<String>::new();
        match formats::FileList.read_clipboard(&mut paths) {
            Ok(_) => Ok(paths
                .into_iter()
                .map(strip_extended_path_prefix)
                .filter(|p| !p.is_empty())
                .collect()),
            Err(_) => Ok(Vec::new()),
        }
    }

    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

fn unique_copy_dest(dir: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("item");
    let ext = Path::new(file_name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    for n in 2..10_000 {
        let next = dir.join(format!("{stem}-{n}{ext}"));
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{stem}-copy{ext}"))
}

fn copy_path_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dest).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            copy_path_recursive(&entry.path(), &dest.join(name))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(src, dest).map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn is_same_or_into(src: &Path, dest_dir: &Path) -> bool {
    let Ok(src_canon) = src.canonicalize() else {
        return false;
    };
    let Ok(dest_canon) = dest_dir.canonicalize() else {
        return false;
    };
    if src_canon == dest_canon {
        return true;
    }
    dest_canon.starts_with(&src_canon)
}

/// Copy absolute files/folders into `dest_dir`. Returns absolute paths of created entries.
#[tauri::command]
fn copy_paths_into_dir(sources: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
    let dest = PathBuf::from(&dest_dir);
    if !dest.is_dir() {
        return Err(format!("not a directory: {dest_dir}"));
    }
    let mut created = Vec::new();
    for source in sources {
        let src = PathBuf::from(&source);
        if !src.exists() {
            return Err(format!("path not found: {source}"));
        }
        if src.is_dir() && is_same_or_into(&src, &dest) {
            return Err("cannot paste a folder into itself or its subfolder".into());
        }
        let name = src
            .file_name()
            .ok_or_else(|| format!("invalid path: {source}"))?;
        let target = unique_copy_dest(&dest, name);
        copy_path_recursive(&src, &target)?;
        let mut s = target.to_string_lossy().to_string();
        s = strip_extended_path_prefix(s);
        created.push(s.replace('\\', "/"));
    }
    Ok(created)
}

#[tauri::command]
fn vault_asset_url(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = match Path::new(&path).extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            default_vault_path,
            pick_vault_folder,
            list_directory,
            open_vault_folder,
            open_url,
            reveal_vault_entry,
            clipboard_write_files,
            clipboard_read_files,
            copy_paths_into_dir,
            vault_read_text,
            vault_read_binary,
            vault_write_text,
            vault_write_binary,
            vault_delete,
            vault_rename,
            vault_mkdir,
            vault_exists,
            vault_list,
            vault_asset_url,
            store_pin_image_payload,
            take_pin_image_payload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
