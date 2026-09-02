use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

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

    let folder = dialog.blocking_pick_folder().ok_or_else(|| "cancelled".into())?;
    let path = folder.into_path().map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err("not a directory".into());
    }
    Ok(path.to_string_lossy().replace('\\', "/"))
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

const GITHUB_RELEASES_URLS: &[&str] = &[
    "https://api.github.com/repos/nine-waited/ChestnutEditor/releases?per_page=30",
    "https://gh-proxy.com/https://api.github.com/repos/nine-waited/ChestnutEditor/releases?per_page=30",
];

fn curl_get_text(url: &str) -> Result<String, String> {
    #[cfg(windows)]
    let bin = "curl.exe";
    #[cfg(not(windows))]
    let bin = "curl";
    let mut cmd = std::process::Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.arg("--ssl-no-revoke");
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.args([
        "-L",
        "--fail",
        "-sS",
        "--retry",
        "2",
        "--connect-timeout",
        "15",
        "--max-time",
        "45",
        "-A",
        "Chestnut-Editor (https://github.com/nine-waited/ChestnutEditor)",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        url,
    ]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "github request failed".into()
        } else {
            err
        });
    }
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

/// Fetch GitHub release JSON. WebView cannot call api.github.com (CORS).
#[tauri::command]
fn fetch_app_github_releases() -> Result<String, String> {
    let mut last = String::from("github request failed");
    for url in GITHUB_RELEASES_URLS {
        match curl_get_text(url) {
            Ok(body) => {
                if body.trim_start().starts_with('[') {
                    return Ok(body);
                }
                last = "unexpected github response".into();
            }
            Err(err) => last = err,
        }
    }
    Err(last)
}

#[tauri::command]
fn reveal_vault_entry(vault_root: String, entry_path: Option<String>) -> Result<(), String> {
    let path = match entry_path.filter(|entry| !entry.is_empty()) {
        Some(rel) => resolve(&vault_root, &rel)?,
        None => PathBuf::from(vault_root),
    };
    open_path_in_explorer(path)
}

const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_MOVE: u32 = 2;

#[cfg(windows)]
fn preferred_drop_effect_format() -> Result<u32, String> {
    clipboard_win::raw::register_format("Preferred DropEffect")
        .map(|fmt| fmt.get())
        .ok_or_else(|| "register Preferred DropEffect failed".into())
}

#[cfg(windows)]
fn write_preferred_drop_effect(cut: bool) -> Result<(), String> {
    let fmt = preferred_drop_effect_format()?;
    let effect = if cut { DROPEFFECT_MOVE } else { DROPEFFECT_COPY };
    // `raw::set` empties the clipboard first and would wipe CF_HDROP.
    clipboard_win::raw::set_without_clear(fmt, effect.to_le_bytes().as_slice())
        .map_err(|code| format!("set Preferred DropEffect: {code}"))
}

#[cfg(windows)]
fn read_preferred_drop_effect_is_cut() -> bool {
    let Ok(fmt) = preferred_drop_effect_format() else {
        return false;
    };
    let mut buf = [0u8; 4];
    match clipboard_win::raw::get(fmt, &mut buf) {
        Ok(n) if n >= 4 => u32::from_le_bytes(buf) == DROPEFFECT_MOVE,
        _ => false,
    }
}

/// Put absolute file paths on the OS clipboard as CF_HDROP so Explorer can paste them.
/// `cut` writes Preferred DropEffect=MOVE so Explorer / in-app paste will move.
#[tauri::command]
fn clipboard_write_files(paths: Vec<String>, cut: Option<bool>) -> Result<(), String> {
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
        write_preferred_drop_effect(cut.unwrap_or(false))?;
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = (paths, cut);
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

/// True when the OS clipboard file list is a Cut (Preferred DropEffect = MOVE).
#[tauri::command]
fn clipboard_files_are_cut() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use clipboard_win::Clipboard;

        let _clip = match Clipboard::new_attempts(10) {
            Ok(clip) => clip,
            Err(_) => return Ok(false),
        };
        Ok(read_preferred_drop_effect_is_cut())
    }

    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn clipboard_clear() -> Result<(), String> {
    #[cfg(windows)]
    {
        use clipboard_win::Clipboard;

        let _clip = Clipboard::new_attempts(10).map_err(|code| format!("open clipboard: {code}"))?;
        clipboard_win::empty().map_err(|code| format!("empty clipboard: {code}"))
    }

    #[cfg(not(windows))]
    {
        Ok(())
    }
}

fn remove_path_recursive(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

/// Move absolute files/folders into `dest_dir`. Returns absolute paths of created entries.
#[tauri::command]
fn move_paths_into_dir(sources: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
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
        if fs::rename(&src, &target).is_err() {
            copy_path_recursive(&src, &target)?;
            remove_path_recursive(&src)?;
        }
        let mut s = target.to_string_lossy().to_string();
        s = strip_extended_path_prefix(s);
        created.push(s.replace('\\', "/"));
    }
    Ok(created)
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
    Ok(data_url_for(&path, &bytes))
}

fn data_url_for(path: &str, bytes: &[u8]) -> String {
    let mime = match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("ttf") | Some("otf") => "font/ttf",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("js") | Some("mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        _ => "application/octet-stream",
    };
    format!("data:{};base64,{}", mime, STANDARD.encode(bytes))
}

fn plugin_id_ok(id: &str) -> bool {
    let mut chars = id.chars();
    matches!(chars.next(), Some('a'..='z' | 'A'..='Z' | '0'..='9'))
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

fn app_plugins_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe
        .parent()
        .ok_or_else(|| "missing executable directory".to_string())?
        .join("plugins");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn plugin_rel_path(plugin_id: &str, rel: &str) -> Result<PathBuf, String> {
    if !plugin_id_ok(plugin_id) {
        return Err("invalid plugin id".into());
    }
    let rel = normalize_rel(rel)?;
    if rel.as_os_str().is_empty() {
        return Err("empty path".into());
    }
    Ok(app_plugins_dir()?.join(plugin_id).join(rel))
}

#[derive(Clone, Serialize, Deserialize)]
struct AppPluginManifest {
    id: String,
    name: String,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    main: Option<String>,
    #[serde(rename = "minAppVersion", skip_serializing_if = "Option::is_none")]
    min_app_version: Option<String>,
}

#[tauri::command]
fn app_plugins_path() -> Result<String, String> {
    Ok(app_plugins_dir()?.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn list_app_plugins() -> Result<Vec<AppPluginManifest>, String> {
    let root = app_plugins_dir()?;
    let mut out = Vec::new();
    let read_dir = match fs::read_dir(&root) {
        Ok(v) => v,
        Err(_) => return Ok(out),
    };
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let manifest_path = entry.path().join("manifest.json");
        let Ok(raw) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        if let Ok(manifest) = serde_json::from_str::<AppPluginManifest>(&raw) {
            out.push(manifest);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
fn app_plugin_read_text(plugin_id: String, rel_path: String) -> Result<String, String> {
    let path = plugin_rel_path(&plugin_id, &rel_path)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_plugin_write_text(plugin_id: String, rel_path: String, content: String) -> Result<(), String> {
    let path = plugin_rel_path(&plugin_id, &rel_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_plugin_asset_url(plugin_id: String, rel_path: String) -> Result<String, String> {
    let path = plugin_rel_path(&plugin_id, &rel_path)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(data_url_for(&path.to_string_lossy(), &bytes))
}

#[tauri::command]
fn uninstall_app_plugin(plugin_id: String) -> Result<(), String> {
    if !plugin_id_ok(&plugin_id) {
        return Err("invalid plugin id".into());
    }
    let root = app_plugins_dir()?;
    let dest = root.join(&plugin_id);
    if dest.parent() != Some(root.as_path()) {
        return Err("invalid plugin path".into());
    }
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn install_app_plugin_zip(bytes: Vec<u8>) -> Result<AppPluginManifest, String> {
    install_app_plugin_zip_bytes(bytes)
}

#[tauri::command]
fn install_app_plugin_zip_path(path: String) -> Result<AppPluginManifest, String> {
    if !path.to_ascii_lowercase().ends_with(".zip") {
        return Err("need a .zip plugin pack".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    install_app_plugin_zip_bytes(bytes)
}

#[tauri::command]
fn pick_and_install_app_plugin_zip(app: tauri::AppHandle) -> Result<AppPluginManifest, String> {
    use tauri_plugin_dialog::DialogExt;

    let file = app
        .dialog()
        .file()
        .add_filter("Plugin zip", &["zip"])
        .blocking_pick_file()
        .ok_or_else(|| "cancelled".to_string())?;
    let path = file
        .into_path()
        .map_err(|e| e.to_string())?;
    if path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("zip"))
        != Some(true)
    {
        return Err("need a .zip plugin pack".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    install_app_plugin_zip_bytes(bytes)
}

fn install_app_plugin_zip_bytes(bytes: Vec<u8>) -> Result<AppPluginManifest, String> {
    use std::io::{Cursor, Read};
    use zip::ZipArchive;

    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        names.push(file.name().replace('\\', "/"));
    }
    let manifest_name = names
        .iter()
        .filter(|n| n.to_ascii_lowercase().ends_with("manifest.json") && !n.ends_with('/'))
        .min_by_key(|n| n.matches('/').count())
        .cloned()
        .ok_or_else(|| "zip is missing manifest.json".to_string())?;
    let prefix = match manifest_name.rsplit_once('/') {
        Some((dir, _)) => format!("{dir}/"),
        None => String::new(),
    };
    let manifest_index = names
        .iter()
        .position(|n| n == &manifest_name)
        .ok_or_else(|| "zip is missing manifest.json".to_string())?;
    let mut manifest_raw = String::new();
    {
        let mut file = archive.by_index(manifest_index).map_err(|e| e.to_string())?;
        file.read_to_string(&mut manifest_raw)
            .map_err(|e| e.to_string())?;
    }
    let manifest: AppPluginManifest =
        serde_json::from_str(&manifest_raw).map_err(|e| format!("invalid manifest: {e}"))?;
    if !plugin_id_ok(&manifest.id) {
        return Err("invalid plugin id".into());
    }
    let dest = app_plugins_dir()?.join(&manifest.id);
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().replace('\\', "/");
        if prefix.is_empty() {
            if name.contains("..") {
                return Err("invalid zip path".into());
            }
        } else if !name.starts_with(&prefix) {
            continue;
        }
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            name[prefix.len()..].to_string()
        };
        if rel.is_empty() || rel.ends_with('/') {
            continue;
        }
        let rel_buf = normalize_rel(&rel)?;
        let out_path = dest.join(&rel_buf);
        if !out_path.starts_with(&dest) {
            return Err("invalid zip path".into());
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
    }

    let main = manifest.main.clone().unwrap_or_else(|| "main.js".into());
    if !dest.join(&main).is_file() {
        return Err(format!("zip is missing {main}"));
    }
    Ok(manifest)
}

const XIAOLAI_URLS: &[&str] = &[
    "https://github.com/lxgw/kose-font/releases/download/v3.126/Xiaolai-Regular.ttf",
    "https://github.com/lxgw/kose-font/releases/latest/download/Xiaolai-Regular.ttf",
    "https://gh-proxy.com/https://github.com/lxgw/kose-font/releases/download/v3.126/Xiaolai-Regular.ttf",
];

const YOZAI_URLS: &[&str] = &[
    "https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Regular.ttf",
    "https://github.com/lxgw/yozai-font/releases/latest/download/Yozai-Regular.ttf",
    "https://gh-proxy.com/https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Regular.ttf",
];

fn ui_font_id_ok(id: &str) -> bool {
    matches!(id, "xiaolai" | "yozai")
}

fn ui_font_urls(id: &str) -> Result<&'static [&'static str], String> {
    match id {
        "xiaolai" => Ok(XIAOLAI_URLS),
        "yozai" => Ok(YOZAI_URLS),
        _ => Err("unknown font".into()),
    }
}

fn app_fonts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("fonts");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn ui_font_file(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !ui_font_id_ok(id) {
        return Err("unknown font".into());
    }
    Ok(app_fonts_dir(app)?.join(format!("{id}.ttf")))
}

fn looks_like_font(magic: &[u8]) -> bool {
    magic.len() >= 4
        && matches!(
            &magic[0..4],
            b"\x00\x01\x00\x00" | b"OTTO" | b"true" | b"wOFF" | b"ttcf"
        )
}

fn ui_font_file_ready(path: &Path) -> bool {
    use std::io::Read;
    let Ok(meta) = fs::metadata(path) else {
        return false;
    };
    if meta.len() <= 1_000_000 {
        return false;
    }
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).is_ok() && looks_like_font(&magic)
}

fn ui_font_expected_bytes(id: &str) -> u64 {
    match id {
        "xiaolai" => 22_220_806,
        "yozai" => 15_605_374,
        _ => 0,
    }
}

#[derive(Clone, Serialize)]
struct UiFontDownloadProgress {
    id: String,
    received: u64,
    total: u64,
}

fn emit_download_progress(app: &tauri::AppHandle, event: &str, id: &str, received: u64, total: u64) {
    let _ = app.emit(
        event,
        UiFontDownloadProgress {
            id: id.to_string(),
            received,
            total,
        },
    );
}

fn emit_font_progress(app: &tauri::AppHandle, id: &str, received: u64, total: u64) {
    emit_download_progress(
        app,
        "ui-font-download-progress",
        id,
        received,
        if total == 0 {
            ui_font_expected_bytes(id)
        } else {
            total
        },
    );
}

fn parse_curl_size(s: &str) -> Option<u64> {
    let s = s.trim();
    let (num, mul) = if let Some(rest) = s.strip_suffix(['M', 'm']) {
        (rest, 1024u64 * 1024)
    } else if let Some(rest) = s.strip_suffix(['K', 'k']) {
        (rest, 1024)
    } else if let Some(rest) = s.strip_suffix(['G', 'g']) {
        (rest, 1024 * 1024 * 1024)
    } else if s.chars().all(|c| c.is_ascii_digit()) {
        return s.parse().ok();
    } else {
        return None;
    };
    let n: f64 = num.parse().ok()?;
    Some((n * mul as f64).round() as u64)
}

fn parse_curl_progress(line: &str) -> Option<(u64, u64)> {
    if line.contains("Total") || line.contains("Average") || line.contains("Dload") {
        return None;
    }
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }
    let total = parse_curl_size(parts[1])?;
    let received = parse_curl_size(parts[3])?;
    if total == 0 {
        return None;
    }
    Some((received, total))
}

fn pump_curl_progress(app: &tauri::AppHandle, event: &str, id: &str, mut stderr: impl Read) -> String {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    let mut last_err = String::new();
    loop {
        match stderr.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                if byte[0] == b'\r' || byte[0] == b'\n' {
                    if buf.is_empty() {
                        continue;
                    }
                    let line = String::from_utf8_lossy(&buf).into_owned();
                    buf.clear();
                    if line.starts_with("curl:") {
                        last_err = line;
                    } else if let Some((received, total)) = parse_curl_progress(&line) {
                        emit_download_progress(app, event, id, received, total);
                    }
                } else {
                    buf.push(byte[0]);
                    if buf.len() > 2048 {
                        buf.clear();
                    }
                }
            }
            Err(_) => break,
        }
    }
    last_err
}

fn download_url_to_file(
    app: &tauri::AppHandle,
    id: &str,
    url: &str,
    dest: &Path,
    progress_event: &str,
) -> Result<(), String> {
    let dest_str = dest.to_str().ok_or_else(|| "invalid download path".to_string())?;
    #[cfg(windows)]
    let bin = "curl.exe";
    #[cfg(not(windows))]
    let bin = "curl";
    let mut cmd = std::process::Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.arg("--ssl-no-revoke");
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.args([
        "-L",
        "--fail",
        "-C",
        "-",
        "--retry",
        "2",
        "--connect-timeout",
        "30",
        "--max-time",
        "600",
        "-A",
        "Chestnut-Editor (https://github.com/nine-waited/ChestnutEditor)",
        "-o",
        dest_str,
        url,
    ]);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let progress_err = if let Some(stderr) = child.stderr.take() {
        pump_curl_progress(app, progress_event, id, stderr)
    } else {
        String::new()
    };
    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        return Ok(());
    }
    if progress_err.is_empty() {
        Err("download failed".into())
    } else {
        Err(progress_err)
    }
}

fn download_ui_font_sync(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    emit_font_progress(app, id, 0, ui_font_expected_bytes(id));
    let urls = ui_font_urls(id)?;
    let dest = ui_font_file(app, id)?;
    let tmp = dest.with_extension("ttf.part");
    let mut last_err = String::from("download failed");
    for url in urls {
        if let Err(err) = download_url_to_file(app, id, url, &tmp, "ui-font-download-progress") {
            last_err = err;
            let _ = fs::remove_file(&tmp);
            continue;
        }
        if !ui_font_file_ready(&tmp) {
            last_err = "downloaded file is not a valid font".into();
            let _ = fs::remove_file(&tmp);
            continue;
        }
        if dest.exists() {
            fs::remove_file(&dest).map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
        if let Ok(meta) = fs::metadata(&dest) {
            emit_font_progress(app, id, meta.len(), meta.len());
        }
        return Ok(());
    }
    Err(last_err)
}

#[tauri::command]
fn list_ui_fonts(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for id in ["xiaolai", "yozai"] {
        if ui_font_file_ready(&ui_font_file(&app, id)?) {
            out.push(id.to_string());
        }
    }
    Ok(out)
}

#[tauri::command]
async fn ui_font_asset_url(app: tauri::AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = ui_font_file(&app, &id)?;
        if !ui_font_file_ready(&path) {
            return Err("font is not installed".into());
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        Ok(data_url_for(&path.to_string_lossy(), &bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn download_ui_font(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !ui_font_id_ok(&id) {
        return Err("unknown font".into());
    }
    tauri::async_runtime::spawn_blocking(move || download_ui_font_sync(&app, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn uninstall_ui_font(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = ui_font_file(&app, &id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

const CHESTNUT_CAT_URLS: &[&str] = &[
    "https://github.com/nine-waited/ChestnutCat/releases/download/v1.0.0/chestnut-cat-1.0.0.zip",
    "https://gh-proxy.com/https://github.com/nine-waited/ChestnutCat/releases/download/v1.0.0/chestnut-cat-1.0.0.zip",
];

fn downloadable_plugin_id_ok(id: &str) -> bool {
    id == "chestnut-cat"
}

fn plugin_download_urls(id: &str) -> Result<&'static [&'static str], String> {
    match id {
        "chestnut-cat" => Ok(CHESTNUT_CAT_URLS),
        _ => Err("unknown plugin".into()),
    }
}

fn plugin_expected_bytes(id: &str) -> u64 {
    match id {
        "chestnut-cat" => 19_135_103,
        _ => 0,
    }
}

fn emit_plugin_progress(app: &tauri::AppHandle, id: &str, received: u64, total: u64) {
    emit_download_progress(
        app,
        "app-plugin-download-progress",
        id,
        received,
        if total == 0 {
            plugin_expected_bytes(id)
        } else {
            total
        },
    );
}

fn plugin_download_part(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("plugin-downloads");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{id}.zip.part")))
}

fn looks_like_zip(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).is_ok() && magic == *b"PK\x03\x04"
}

fn download_app_plugin_sync(app: &tauri::AppHandle, id: &str) -> Result<AppPluginManifest, String> {
    emit_plugin_progress(app, id, 0, plugin_expected_bytes(id));
    let urls = plugin_download_urls(id)?;
    let tmp = plugin_download_part(app, id)?;
    let mut last_err = String::from("download failed");
    for url in urls {
        if let Err(err) = download_url_to_file(app, id, url, &tmp, "app-plugin-download-progress") {
            last_err = err;
            let _ = fs::remove_file(&tmp);
            continue;
        }
        if !looks_like_zip(&tmp) {
            last_err = "downloaded file is not a valid plugin zip".into();
            let _ = fs::remove_file(&tmp);
            continue;
        }
        let bytes = match fs::read(&tmp) {
            Ok(v) => v,
            Err(err) => {
                last_err = err.to_string();
                let _ = fs::remove_file(&tmp);
                continue;
            }
        };
        let _ = fs::remove_file(&tmp);
        let manifest = install_app_plugin_zip_bytes(bytes)?;
        if manifest.id != id {
            let _ = uninstall_app_plugin(manifest.id.clone());
            return Err("unexpected plugin id".into());
        }
        let expected = plugin_expected_bytes(id);
        emit_plugin_progress(app, id, expected, expected);
        return Ok(manifest);
    }
    Err(last_err)
}

#[tauri::command]
async fn download_app_plugin(app: tauri::AppHandle, id: String) -> Result<AppPluginManifest, String> {
    if !downloadable_plugin_id_ok(&id) {
        return Err("unknown plugin".into());
    }
    tauri::async_runtime::spawn_blocking(move || download_app_plugin_sync(&app, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
const TOGGLE_SOURCE_EVENT: &str = "chestnut-toggle-source";
#[cfg(windows)]
const VK_TAB: u32 = 0x09;
#[cfg(windows)]
const VK_CONTROL: i32 = 0x11;
#[cfg(windows)]
const VK_SHIFT: i32 = 0x10;
#[cfg(windows)]
const VK_MENU: i32 = 0x12;

#[cfg(windows)]
extern "system" {
    fn GetKeyState(n_virt_key: i32) -> i16;
}

#[cfg(windows)]
fn win_key_down(vk: i32) -> bool {
    (unsafe { GetKeyState(vk) }) < 0
}

/// WebView2 otherwise eats Ctrl+Tab as a browser accelerator. Handle only that chord
/// so Ctrl+F / Ctrl+R still reach the browser.
#[cfg(windows)]
fn intercept_ctrl_tab_for_source_toggle(
    app: tauri::AppHandle,
    webview: tauri::webview::PlatformWebview,
) {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
        },
        AcceleratorKeyPressedEventHandler,
    };

    let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_sender, args| {
        if let Some(args) = args {
            let mut key = 0u32;
            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND(0);
            if unsafe { args.VirtualKey(&mut key) }.is_err() {
                return Ok(());
            }
            if unsafe { args.KeyEventKind(&mut kind) }.is_err() {
                return Ok(());
            }
            if key != VK_TAB || kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
                return Ok(());
            }
            if win_key_down(VK_CONTROL) && !win_key_down(VK_SHIFT) && !win_key_down(VK_MENU) {
                let _ = unsafe { args.SetHandled(true) };
                let _ = app.emit(TOGGLE_SOURCE_EVENT, ());
            }
        }
        Ok(())
    }));
    let mut token = 0i64;
    let _ = unsafe { webview.controller().add_AcceleratorKeyPressed(&handler, &mut token) };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(windows)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let handle = app.handle().clone();
                    let _ = window.with_webview(move |webview| {
                        intercept_ctrl_tab_for_source_toggle(handle, webview);
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            default_vault_path,
            pick_vault_folder,
            list_directory,
            open_vault_folder,
            open_url,
            fetch_app_github_releases,
            reveal_vault_entry,
            clipboard_write_files,
            clipboard_read_files,
            clipboard_files_are_cut,
            clipboard_clear,
            copy_paths_into_dir,
            move_paths_into_dir,
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
            app_plugins_path,
            list_app_plugins,
            app_plugin_read_text,
            app_plugin_write_text,
            app_plugin_asset_url,
            install_app_plugin_zip,
            install_app_plugin_zip_path,
            pick_and_install_app_plugin_zip,
            uninstall_app_plugin,
            download_app_plugin,
            list_ui_fonts,
            ui_font_asset_url,
            download_ui_font,
            uninstall_ui_font,
            store_pin_image_payload,
            take_pin_image_payload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
