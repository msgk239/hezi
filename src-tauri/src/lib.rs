use arboard::Clipboard;
use base64::{engine::general_purpose, Engine as _};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use pathdiff::diff_paths;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering as CmpOrdering;
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, State, WebviewWindow,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectItem {
    id: String,
    name: String,
    path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OpenedFileRef {
    path: String,
    project_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    font_size: u32,
    sidebar_width: u32,
    #[serde(default = "default_file_sort_mode")]
    file_sort_mode: String,
    #[serde(default)]
    folder_sort_modes: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    projects: Vec<ProjectItem>,
    opened_files: Vec<OpenedFileRef>,
    active_file_path: String,
    active_project_id: Option<String>,
    #[serde(default)]
    expanded_paths: Vec<String>,
    #[serde(default)]
    tree_state_initialized: bool,
    settings: AppSettings,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFolderSelection {
    path: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntry {
    name: String,
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    size: Option<u64>,
    created_at: Option<u128>,
    modified_at: Option<u128>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInfo {
    path: String,
    name: String,
    extension: String,
    exists: bool,
    #[serde(rename = "type")]
    entry_type: String,
    size: u64,
    modified_at: u128,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirectoriesChangedPayload {
    paths: Vec<String>,
}

#[derive(Debug, Clone)]
struct WatchedDirectory {
    path: PathBuf,
    subscribers: usize,
}

struct DirectoryWatchState {
    watcher: Mutex<RecommendedWatcher>,
    watched: Arc<Mutex<HashMap<String, WatchedDirectory>>>,
}

enum DirectoryWatchMessage {
    Event(Event),
    Rescan,
}

const CONFIG_FILE_NAME: &str = "project-box-config.json";
const MAX_TEXT_EDIT_BYTES: u64 = 10 * 1024 * 1024;
const MAX_MEDIA_PREVIEW_BYTES: u64 = 100 * 1024 * 1024;
const DIRECTORIES_CHANGED_EVENT: &str = "directories-changed";
const WATCH_DEBOUNCE: Duration = Duration::from_millis(300);
const WATCH_MAX_BATCH: Duration = Duration::from_millis(1_000);

fn default_config() -> AppConfig {
    AppConfig {
        projects: vec![],
        opened_files: vec![],
        active_file_path: String::new(),
        active_project_id: Some(String::new()),
        expanded_paths: vec![],
        tree_state_initialized: false,
        settings: AppSettings {
            font_size: 14,
            sidebar_width: 280,
            file_sort_mode: default_file_sort_mode(),
            folder_sort_modes: HashMap::new(),
        },
    }
}

fn err(action: &str, error: impl std::fmt::Display) -> String {
    format!("{action}失败：{error}")
}

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

fn normalize_watch_key(path: impl AsRef<Path>) -> String {
    let mut key = path_to_string(path).replace('\\', "/");

    if let Some(stripped) = key.strip_prefix("//?/UNC/") {
        key = format!("//{stripped}");
    } else if let Some(stripped) = key.strip_prefix("//?/") {
        key = stripped.to_string();
    }

    while key.len() > 1 && key.ends_with('/') {
        key.pop();
    }

    #[cfg(target_os = "windows")]
    {
        key = key.to_lowercase();
    }

    key
}

fn collect_all_watched_keys(
    watched: &Arc<Mutex<HashMap<String, WatchedDirectory>>>,
    dirty: &mut HashSet<String>,
) {
    if let Ok(watched) = watched.lock() {
        dirty.extend(watched.keys().cloned());
    }
}

fn collect_event_watched_keys(
    event: Event,
    watched: &Arc<Mutex<HashMap<String, WatchedDirectory>>>,
    dirty: &mut HashSet<String>,
    rescan: &mut bool,
) {
    if event.need_rescan() {
        *rescan = true;
        return;
    }

    let Ok(watched) = watched.lock() else {
        *rescan = true;
        return;
    };

    if watched.is_empty() {
        return;
    }

    let mut matched = false;
    for event_path in &event.paths {
        if let Some(parent) = event_path.parent() {
            let parent_key = normalize_watch_key(parent);
            if watched.contains_key(&parent_key) {
                dirty.insert(parent_key);
                matched = true;
                continue;
            }
        }

        let event_key = normalize_watch_key(event_path);
        if watched.contains_key(&event_key) {
            dirty.insert(event_key);
            matched = true;
        }
    }

    if !matched {
        *rescan = true;
    }
}

fn merge_watch_message(
    message: DirectoryWatchMessage,
    watched: &Arc<Mutex<HashMap<String, WatchedDirectory>>>,
    dirty: &mut HashSet<String>,
    rescan: &mut bool,
) {
    match message {
        DirectoryWatchMessage::Event(event) => {
            collect_event_watched_keys(event, watched, dirty, rescan)
        }
        DirectoryWatchMessage::Rescan => *rescan = true,
    }
}

fn emit_directory_changes(
    app_handle: &AppHandle,
    watched: &Arc<Mutex<HashMap<String, WatchedDirectory>>>,
    dirty: &HashSet<String>,
    rescan: bool,
) {
    let Ok(watched) = watched.lock() else {
        return;
    };

    let mut paths = if rescan {
        watched
            .values()
            .map(|entry| path_to_string(&entry.path))
            .collect::<Vec<_>>()
    } else {
        dirty
            .iter()
            .filter_map(|key| watched.get(key))
            .map(|entry| path_to_string(&entry.path))
            .collect::<Vec<_>>()
    };

    paths.sort_by_key(|path| path.to_lowercase());
    paths.dedup_by(|left, right| left.eq_ignore_ascii_case(right));

    if !paths.is_empty() {
        let _ = app_handle.emit(
            DIRECTORIES_CHANGED_EVENT,
            DirectoriesChangedPayload { paths },
        );
    }
}

fn run_directory_watch_worker(
    app_handle: AppHandle,
    watched: Arc<Mutex<HashMap<String, WatchedDirectory>>>,
    receiver: mpsc::Receiver<DirectoryWatchMessage>,
) {
    thread::spawn(move || loop {
        let first = match receiver.recv() {
            Ok(message) => message,
            Err(_) => return,
        };

        let started_at = Instant::now();
        let mut quiet_deadline = started_at + WATCH_DEBOUNCE;
        let max_deadline = started_at + WATCH_MAX_BATCH;
        let mut dirty = HashSet::new();
        let mut rescan = false;
        let mut disconnected = false;
        merge_watch_message(first, &watched, &mut dirty, &mut rescan);

        loop {
            let now = Instant::now();
            let flush_at = quiet_deadline.min(max_deadline);
            if now >= flush_at {
                break;
            }

            match receiver.recv_timeout(flush_at.saturating_duration_since(now)) {
                Ok(message) => {
                    merge_watch_message(message, &watched, &mut dirty, &mut rescan);
                    quiet_deadline = Instant::now() + WATCH_DEBOUNCE;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    disconnected = true;
                    break;
                }
            }
        }

        if rescan {
            collect_all_watched_keys(&watched, &mut dirty);
        }
        emit_directory_changes(&app_handle, &watched, &dirty, rescan);

        if disconnected {
            return;
        }
    });
}

fn create_directory_watch_state(app_handle: AppHandle) -> notify::Result<DirectoryWatchState> {
    let watched = Arc::new(Mutex::new(HashMap::new()));
    let (sender, receiver) = mpsc::channel();
    let watcher = notify::recommended_watcher(move |result| {
        let message = match result {
            Ok(event) => DirectoryWatchMessage::Event(event),
            Err(_) => DirectoryWatchMessage::Rescan,
        };
        let _ = sender.send(message);
    })?;

    run_directory_watch_worker(app_handle, watched.clone(), receiver);
    Ok(DirectoryWatchState {
        watcher: Mutex::new(watcher),
        watched,
    })
}

fn file_name(path: impl AsRef<Path>) -> String {
    path.as_ref()
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .unwrap_or_else(|| path_to_string(path))
}

fn modified_at_ms(metadata: &fs::Metadata) -> Option<u128> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

fn created_at_ms(metadata: &fs::Metadata) -> Option<u128> {
    metadata
        .created()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

fn default_file_sort_mode() -> String {
    "name-asc".to_string()
}

fn config_dir() -> Result<PathBuf, String> {
    if let Ok(test_dir) = std::env::var("PROJECT_BOX_CONFIG_DIR") {
        return Ok(PathBuf::from(test_dir));
    }

    dirs::config_dir()
        .map(|dir| dir.join("project-box"))
        .ok_or_else(|| "无法定位用户配置目录".to_string())
}

fn config_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join(CONFIG_FILE_NAME))
}

#[tauri::command]
fn get_config() -> Result<AppConfig, String> {
    let path = config_path().map_err(|error| err("读取配置", error))?;

    if !path.exists() {
        let config = default_config();
        save_config(config.clone())?;
        return Ok(config);
    }

    let raw = fs::read_to_string(&path).map_err(|error| err("读取配置", error))?;
    serde_json::from_str(&raw).map_err(|error| err("解析配置", error))
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    let path = config_path().map_err(|error| err("保存配置", error))?;
    let parent = path
        .parent()
        .ok_or_else(|| err("保存配置", "配置路径无效"))?;
    fs::create_dir_all(parent).map_err(|error| err("创建配置目录", error))?;
    let raw = serde_json::to_string_pretty(&config).map_err(|error| err("序列化配置", error))?;
    fs::write(path, format!("{raw}\n")).map_err(|error| err("保存配置", error))
}

#[tauri::command]
fn select_project_folder() -> Result<Option<ProjectFolderSelection>, String> {
    if let Ok(test_path) = std::env::var("PROJECT_BOX_TEST_PROJECT_PATH") {
        let path = PathBuf::from(test_path);
        return Ok(Some(ProjectFolderSelection {
            name: file_name(&path),
            path: path_to_string(path),
        }));
    }

    let folder = rfd::FileDialog::new()
        .set_title("选择项目文件夹")
        .pick_folder();

    Ok(folder.map(|path| ProjectFolderSelection {
        name: file_name(&path),
        path: path_to_string(path),
    }))
}

#[tauri::command]
fn watch_directory(dir_path: String, state: State<'_, DirectoryWatchState>) -> Result<(), String> {
    let path = PathBuf::from(&dir_path);
    let metadata = fs::metadata(&path).map_err(|error| err("监听目录", error))?;
    if !metadata.is_dir() {
        return Err(err("监听目录", "目标不是文件夹"));
    }

    let key = normalize_watch_key(&path);
    let mut watched = state
        .watched
        .lock()
        .map_err(|_| err("监听目录", "监听状态不可用"))?;

    if let Some(entry) = watched.get_mut(&key) {
        entry.subscribers += 1;
        return Ok(());
    }

    state
        .watcher
        .lock()
        .map_err(|_| err("监听目录", "监听器不可用"))?
        .watch(&path, RecursiveMode::NonRecursive)
        .map_err(|error| err("监听目录", error))?;

    watched.insert(
        key,
        WatchedDirectory {
            path,
            subscribers: 1,
        },
    );
    Ok(())
}

#[tauri::command]
fn unwatch_directory(
    dir_path: String,
    state: State<'_, DirectoryWatchState>,
) -> Result<(), String> {
    let key = normalize_watch_key(&dir_path);
    let mut watched = state
        .watched
        .lock()
        .map_err(|_| err("停止监听目录", "监听状态不可用"))?;

    let Some(entry) = watched.get_mut(&key) else {
        return Ok(());
    };

    if entry.subscribers > 1 {
        entry.subscribers -= 1;
        return Ok(());
    }

    let path = entry.path.clone();
    watched.remove(&key);
    drop(watched);

    let _ = state
        .watcher
        .lock()
        .map_err(|_| err("停止监听目录", "监听器不可用"))?
        .unwatch(&path);
    Ok(())
}

#[tauri::command]
fn read_dir(dir_path: String) -> Result<Vec<DirectoryEntry>, String> {
    let mut entries = vec![];
    let read_dir = fs::read_dir(&dir_path).map_err(|error| err("读取目录", error))?;

    for entry in read_dir {
        let entry = entry.map_err(|error| err("读取目录项", error))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| err("读取路径信息", error))?;

        let is_dir = metadata.is_dir();
        let is_file = metadata.is_file();
        if !is_dir && !is_file {
            continue;
        }

        entries.push(DirectoryEntry {
            name: file_name(&path),
            path: path_to_string(&path),
            entry_type: if is_dir { "directory" } else { "file" }.to_string(),
            size: Some(metadata.len()),
            created_at: created_at_ms(&metadata),
            modified_at: modified_at_ms(&metadata),
        });
    }

    entries.sort_by(
        |a, b| match (a.entry_type.as_str(), b.entry_type.as_str()) {
            ("directory", "file") => CmpOrdering::Less,
            ("file", "directory") => CmpOrdering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        },
    );

    Ok(entries)
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    let metadata = fs::metadata(&file_path).map_err(|error| err("读取文件", error))?;
    if !metadata.is_file() {
        return Err(err("读取文件", "目标不是文件"));
    }

    if metadata.len() > MAX_TEXT_EDIT_BYTES {
        return Err(err(
            "读取文件",
            format!(
                "文件超过 {} MB，请使用默认应用打开",
                MAX_TEXT_EDIT_BYTES / 1024 / 1024
            ),
        ));
    }

    let mut bytes = fs::read(file_path).map_err(|error| err("读取文件", error))?;
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        bytes.drain(..3);
    }

    if bytes.contains(&0) {
        return Err(err("读取文件", "文件看起来不是文本文件"));
    }

    String::from_utf8(bytes).map_err(|_| err("读取文件", "文件不是 UTF-8 文本"))
}

#[tauri::command]
fn read_media_file(file_path: String) -> Result<String, String> {
    let metadata = fs::metadata(&file_path).map_err(|error| err("读取媒体文件", error))?;
    if !metadata.is_file() {
        return Err(err("读取媒体文件", "目标不是文件"));
    }

    if metadata.len() > MAX_MEDIA_PREVIEW_BYTES {
        return Err(err(
            "读取媒体文件",
            format!(
                "文件超过 {} MB，请使用默认应用打开",
                MAX_MEDIA_PREVIEW_BYTES / 1024 / 1024
            ),
        ));
    }

    let bytes = fs::read(file_path).map_err(|error| err("读取媒体文件", error))?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn write_file(file_path: String, content: String) -> Result<(), String> {
    fs::write(file_path, content).map_err(|error| err("保存文件", error))
}

#[tauri::command]
fn create_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| err("创建父目录", error))?;
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| err("新建文件", error))?;
    file.write_all(b"").map_err(|error| err("新建文件", error))
}

#[tauri::command]
fn create_folder(folder_path: String) -> Result<(), String> {
    fs::create_dir_all(folder_path).map_err(|error| err("新建文件夹", error))
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err(err("重命名", "目标路径已存在"));
    }

    fs::rename(old_path, new_path).map_err(|error| err("重命名", error))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    trash::delete(path).map_err(|error| err("删除到回收站", error))
}

#[tauri::command]
fn open_with_default_app(path: String) -> Result<(), String> {
    open::that(path).map_err(|error| err("用默认应用打开", error))
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|error| err("在资源管理器中显示", error))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let parent = Path::new(&path)
            .parent()
            .map(path_to_string)
            .unwrap_or(path);
        open::that(parent).map_err(|error| err("在文件管理器中显示", error))
    }
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| err("打开剪贴板", error))?;
    clipboard
        .set_text(text)
        .map_err(|error| err("复制到剪贴板", error))
}

#[cfg(target_os = "windows")]
struct WindowsClipboardGuard;

#[cfg(target_os = "windows")]
impl Drop for WindowsClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::System::DataExchange::CloseClipboard();
        }
    }
}

#[cfg(target_os = "windows")]
fn normalize_clipboard_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    if paths.is_empty() {
        return Err(err("复制文件", "没有可复制的路径"));
    }

    let current_dir = std::env::current_dir().map_err(|error| err("读取当前目录", error))?;
    paths
        .into_iter()
        .map(|path| {
            let path = PathBuf::from(path);
            let path = if path.is_absolute() {
                path
            } else {
                current_dir.join(path)
            };

            if !path.exists() {
                return Err(err(
                    "复制文件",
                    format!("路径不存在：{}", path_to_string(path)),
                ));
            }

            Ok(path_to_string(path))
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn create_hglobal_from_bytes(bytes: &[u8]) -> Result<windows::Win32::Foundation::HGLOBAL, String> {
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len()) }
        .map_err(|error| err("分配剪贴板内存", error))?;
    let ptr = unsafe { GlobalLock(handle) } as *mut u8;
    if ptr.is_null() {
        return Err(err("锁定剪贴板内存", "GlobalLock 返回空指针"));
    }

    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        let _ = GlobalUnlock(handle);
    }

    Ok(handle)
}

#[cfg(target_os = "windows")]
fn create_hdrop_handle(paths: &[String]) -> Result<windows::Win32::Foundation::HGLOBAL, String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Shell::DROPFILES;

    let encoded_paths = paths
        .iter()
        .map(|path| {
            path.encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>()
        })
        .collect::<Vec<_>>();
    let path_unit_count = encoded_paths.iter().map(Vec::len).sum::<usize>() + 1;
    let dropfiles_size = std::mem::size_of::<DROPFILES>();
    let total_size = dropfiles_size + path_unit_count * std::mem::size_of::<u16>();
    let mut bytes = vec![0_u8; total_size];

    unsafe {
        let dropfiles = DROPFILES {
            pFiles: dropfiles_size as u32,
            pt: POINT { x: 0, y: 0 },
            fNC: false.into(),
            fWide: true.into(),
        };
        std::ptr::write(bytes.as_mut_ptr() as *mut DROPFILES, dropfiles);

        let mut cursor = bytes.as_mut_ptr().add(dropfiles_size) as *mut u16;
        for path in encoded_paths {
            std::ptr::copy_nonoverlapping(path.as_ptr(), cursor, path.len());
            cursor = cursor.add(path.len());
        }
        cursor.write(0);
    }

    create_hglobal_from_bytes(&bytes)
}

#[cfg(target_os = "windows")]
fn create_drop_effect_handle(cut: bool) -> Result<windows::Win32::Foundation::HGLOBAL, String> {
    use windows::Win32::System::Ole::{DROPEFFECT_COPY, DROPEFFECT_MOVE};

    let effect = if cut {
        DROPEFFECT_MOVE.0
    } else {
        DROPEFFECT_COPY.0
    };

    create_hglobal_from_bytes(&effect.to_le_bytes())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn set_file_clipboard(paths: Vec<String>, operation: String) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::DataExchange::{
        EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Ole::CF_HDROP;

    let cut = match operation.as_str() {
        "copy" => false,
        "cut" => true,
        _ => return Err(err("复制文件", "未知剪贴板操作")),
    };

    let paths = normalize_clipboard_paths(paths)?;
    let hdrop_handle = create_hdrop_handle(&paths)?;
    let drop_effect_handle = create_drop_effect_handle(cut)?;
    let preferred_drop_effect = "Preferred DropEffect"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<u16>>();

    unsafe {
        OpenClipboard(None).map_err(|error| err("打开剪贴板", error))?;
    }
    let _clipboard_guard = WindowsClipboardGuard;

    unsafe {
        EmptyClipboard().map_err(|error| err("清空剪贴板", error))?;
        SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(hdrop_handle.0)))
            .map_err(|error| err("复制文件到剪贴板", error))?;

        let drop_effect_format = RegisterClipboardFormatW(PCWSTR(preferred_drop_effect.as_ptr()));
        if drop_effect_format == 0 {
            return Err(err("注册剪贴板格式", "Preferred DropEffect 注册失败"));
        }

        SetClipboardData(drop_effect_format, Some(HANDLE(drop_effect_handle.0)))
            .map_err(|error| err("设置剪贴板操作类型", error))?;
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_file_clipboard(_paths: Vec<String>, _operation: String) -> Result<(), String> {
    Err(err("复制文件", "当前系统暂不支持复制或剪切文件到剪贴板"))
}

#[tauri::command]
fn path_relative(root_path: String, target_path: String) -> Result<String, String> {
    let root = PathBuf::from(root_path);
    let target = PathBuf::from(target_path);
    let relative = diff_paths(&target, &root).ok_or_else(|| err("计算相对路径", "路径无效"))?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn get_path_info(path: String) -> Result<PathInfo, String> {
    let target = PathBuf::from(&path);

    if !target.exists() {
        return Ok(PathInfo {
            name: file_name(&target),
            extension: target
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| format!(".{}", ext.to_lowercase()))
                .unwrap_or_default(),
            path,
            exists: false,
            entry_type: "missing".to_string(),
            size: 0,
            modified_at: 0,
        });
    }

    let metadata = fs::metadata(&target).map_err(|error| err("读取路径信息", error))?;
    Ok(PathInfo {
        name: file_name(&target),
        extension: target
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| format!(".{}", ext.to_lowercase()))
            .unwrap_or_default(),
        path,
        exists: true,
        entry_type: if metadata.is_dir() {
            "directory"
        } else {
            "file"
        }
        .to_string(),
        size: metadata.len(),
        modified_at: modified_at_ms(&metadata).unwrap_or_default(),
    })
}

fn fit_window_to_work_area<R: Runtime>(window: &WebviewWindow<R>) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    let scale_factor = monitor.scale_factor();
    let work_area = monitor.work_area();
    let work_size = work_area.size.to_logical::<f64>(scale_factor);
    let work_position = work_area.position.to_logical::<f64>(scale_factor);

    let usable_width = (work_size.width - 48.0).max(720.0);
    let usable_height = (work_size.height - 96.0).max(460.0);
    let target_width = 1280.0_f64.min(usable_width);
    let target_height = 760.0_f64.min(usable_height);
    let min_width = 760.0_f64.min(target_width);
    let min_height = 480.0_f64.min(target_height);
    let target_x = work_position.x + ((work_size.width - target_width) / 2.0).max(0.0);
    let target_y = work_position.y + ((work_size.height - target_height) / 2.0).max(0.0);

    let _ = window.set_min_size(Some(LogicalSize::new(min_width, min_height)));
    let _ = window.set_max_size(Some(LogicalSize::new(work_size.width, work_size.height)));
    let _ = window.set_size(LogicalSize::new(target_width, target_height));
    let _ = window.set_position(LogicalPosition::new(target_x, target_y));
}

fn fit_main_window_to_work_area<R: Runtime>(app: &mut tauri::App<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    fit_window_to_work_area(&window);
    install_windows_maximize_work_area_hook(&window);
}

#[cfg(target_os = "windows")]
type WindowProcMap = Mutex<HashMap<isize, isize>>;

#[cfg(target_os = "windows")]
fn original_window_procs() -> &'static WindowProcMap {
    static ORIGINAL_WINDOW_PROCS: OnceLock<WindowProcMap> = OnceLock::new();
    ORIGINAL_WINDOW_PROCS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "windows")]
fn install_windows_maximize_work_area_hook<R: Runtime>(window: &WebviewWindow<R>) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWLP_WNDPROC,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    let hwnd_key = hwnd.0 as isize;
    let hook_proc = work_area_window_proc as *const () as usize as isize;
    let current_proc = unsafe { GetWindowLongPtrW(hwnd, GWLP_WNDPROC) };

    if current_proc == hook_proc {
        return;
    }

    let previous_proc = unsafe { SetWindowLongPtrW(hwnd, GWLP_WNDPROC, hook_proc) };
    if previous_proc != 0 {
        let _ = original_window_procs()
            .lock()
            .map(|mut procs| procs.insert(hwnd_key, previous_proc));
    }
}

#[cfg(not(target_os = "windows"))]
fn install_windows_maximize_work_area_hook<R: Runtime>(_window: &WebviewWindow<R>) {}

#[cfg(target_os = "windows")]
unsafe extern "system" fn work_area_window_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, WM_GETMINMAXINFO, WM_NCDESTROY, WNDPROC,
    };

    if msg == WM_GETMINMAXINFO {
        apply_work_area_maximize_info(hwnd, lparam);
        return windows::Win32::Foundation::LRESULT(0);
    }

    let hwnd_key = hwnd.0 as isize;
    let original_proc = original_window_procs()
        .lock()
        .ok()
        .and_then(|procs| procs.get(&hwnd_key).copied());

    if msg == WM_NCDESTROY {
        let _ = original_window_procs()
            .lock()
            .map(|mut procs| procs.remove(&hwnd_key));
    }

    if let Some(original_proc) = original_proc {
        let proc: WNDPROC = std::mem::transmute(original_proc);
        CallWindowProcW(proc, hwnd, msg, wparam, lparam)
    } else {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

#[cfg(target_os = "windows")]
fn apply_work_area_maximize_info(
    hwnd: windows::Win32::Foundation::HWND,
    lparam: windows::Win32::Foundation::LPARAM,
) {
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::MINMAXINFO;

    let minmax = lparam.0 as *mut MINMAXINFO;
    if minmax.is_null() {
        return;
    }

    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if monitor.0.is_null() {
        return;
    }

    let mut monitor_info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };

    if unsafe { GetMonitorInfoW(monitor, &mut monitor_info) } == false {
        return;
    }

    let monitor_rect = monitor_info.rcMonitor;
    let work_rect = monitor_info.rcWork;
    let work_width = work_rect.right - work_rect.left;
    let work_height = work_rect.bottom - work_rect.top;

    unsafe {
        (*minmax).ptMaxPosition.x = work_rect.left - monitor_rect.left;
        (*minmax).ptMaxPosition.y = work_rect.top - monitor_rect.top;
        (*minmax).ptMaxSize.x = work_width;
        (*minmax).ptMaxSize.y = work_height;
        (*minmax).ptMaxTrackSize.x = work_width;
        (*minmax).ptMaxTrackSize.y = work_height;
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            fit_main_window_to_work_area(app);
            let watch_state = create_directory_watch_state(app.handle().clone())?;
            app.manage(watch_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            select_project_folder,
            watch_directory,
            unwatch_directory,
            read_dir,
            read_file,
            read_media_file,
            write_file,
            create_file,
            create_folder,
            rename_path,
            delete_path,
            open_with_default_app,
            reveal_in_explorer,
            copy_to_clipboard,
            set_file_clipboard,
            path_relative,
            get_path_info
        ])
        .run(tauri::generate_context!())
        .expect("运行项目盒子失败");
}

#[cfg(test)]
mod directory_watch_tests {
    use super::*;

    fn watched_registry(paths: &[&str]) -> Arc<Mutex<HashMap<String, WatchedDirectory>>> {
        let watched = paths
            .iter()
            .map(|path| {
                let path = PathBuf::from(path);
                (
                    normalize_watch_key(&path),
                    WatchedDirectory {
                        path,
                        subscribers: 1,
                    },
                )
            })
            .collect();
        Arc::new(Mutex::new(watched))
    }

    #[test]
    fn file_event_marks_its_expanded_parent() {
        let watched = watched_registry(&[r"D:\workspace"]);
        let event =
            Event::new(notify::EventKind::Any).add_path(PathBuf::from(r"D:\workspace\notes.txt"));
        let mut dirty = HashSet::new();
        let mut rescan = false;

        collect_event_watched_keys(event, &watched, &mut dirty, &mut rescan);

        assert!(!rescan);
        assert_eq!(dirty, HashSet::from([normalize_watch_key(r"D:\workspace")]));
    }

    #[test]
    fn nested_event_marks_only_the_expanded_nested_directory() {
        let watched = watched_registry(&[r"D:\workspace", r"D:\workspace\src"]);
        let event =
            Event::new(notify::EventKind::Any).add_path(PathBuf::from(r"D:\workspace\src\main.rs"));
        let mut dirty = HashSet::new();
        let mut rescan = false;

        collect_event_watched_keys(event, &watched, &mut dirty, &mut rescan);

        assert!(!rescan);
        assert_eq!(
            dirty,
            HashSet::from([normalize_watch_key(r"D:\workspace\src")])
        );
    }

    #[test]
    fn unknown_event_requests_a_safe_rescan() {
        let watched = watched_registry(&[r"D:\workspace"]);
        let event =
            Event::new(notify::EventKind::Any).add_path(PathBuf::from(r"D:\elsewhere\notes.txt"));
        let mut dirty = HashSet::new();
        let mut rescan = false;

        collect_event_watched_keys(event, &watched, &mut dirty, &mut rescan);

        assert!(rescan);
        assert!(dirty.is_empty());
    }
}
