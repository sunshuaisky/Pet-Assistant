use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Command,
    sync::{LazyLock, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{utils::config::Color, Emitter, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IslandSession {
    id: String,
    session_id: String,
    provider: String,
    title: String,
    project: String,
    kind: String,
    phase: String,
    message: String,
    updated_at: String,
    cwd: String,
    source: String,
    needs_approval: bool,
    needs_input: bool,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BridgeSession {
    session_id: String,
    #[serde(default)]
    provider: String,
    #[serde(default)]
    project_name: String,
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    latest_message: Option<String>,
    #[serde(default)]
    phase: String,
    #[serde(default)]
    needs_approval: bool,
    #[serde(default)]
    needs_input: bool,
    #[serde(default)]
    unread_count: u32,
    #[serde(default)]
    last_activity_at: String,
}

#[derive(Clone)]
struct CodexThreadMeta {
    title: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalDecision {
    decision: String,
    message: String,
    decided_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionHistoryItem {
    role: String,
    kind: String,
    title: String,
    message: String,
    detail: String,
    status: String,
    timestamp: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntegrationStatus {
    id: String,
    name: String,
    kind: String,
    status: String,
    message: String,
    installed: bool,
    running: bool,
    focusable: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PetAsset {
    id: String,
    name: String,
    kind: String,
    asset_path: String,
    columns: u8,
    rows: u8,
    width: u16,
    height: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: Option<String>,
    display_name: Option<String>,
    name: Option<String>,
    spritesheet_path: Option<String>,
}

#[derive(Clone)]
struct IntegrationDefinition {
    id: &'static str,
    name: &'static str,
    kind: &'static str,
    command: Option<&'static str>,
    app_name: Option<&'static str>,
    bundle_id: Option<&'static str>,
    app_paths: &'static [&'static str],
    process_patterns: &'static [&'static str],
}

#[derive(Clone)]
struct RunningProcess {
    pid: String,
    args: String,
    cwd: Option<String>,
}

struct AppState {
    sessions: Mutex<Vec<IslandSession>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatApiConfig {
    enabled: bool,
    base_url: String,
    api_key: String,
    model: String,
    system_prompt: String,
}

impl Default for ChatApiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            base_url: "https://api.openai.com/v1".into(),
            api_key: String::new(),
            model: "gpt-4.1-mini".into(),
            system_prompt: "你是 Phoenix Pet 的聊天助手。回答简洁、准确。".into(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatApiConfigInput {
    enabled: bool,
    base_url: String,
    api_key: Option<String>,
    model: String,
    system_prompt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatApiConfigView {
    enabled: bool,
    base_url: String,
    model: String,
    system_prompt: String,
    has_api_key: bool,
}

impl From<&ChatApiConfig> for ChatApiConfigView {
    fn from(config: &ChatApiConfig) -> Self {
        Self {
            enabled: config.enabled,
            base_url: config.base_url.clone(),
            model: config.model.clone(),
            system_prompt: config.system_prompt.clone(),
            has_api_key: !config.api_key.is_empty(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatApiMessage {
    role: String,
    content: serde_json::Value,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    #[serde(default)]
    model: String,
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatApiReply {
    content: String,
    requested_model: String,
    model: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatStreamChunk {
    request_id: String,
    delta: String,
    model: String,
}

#[derive(Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Deserialize)]
struct ChatCompletionMessage {
    content: String,
}

const BRIDGE_ACTIVE_SESSION_TTL_MS: u128 = 12 * 60 * 60 * 1000;
const SESSION_WATCH_INTERVAL_MS: u64 = 1_500;
const PROCESS_CWD_CACHE_TTL_MS: u128 = 30_000;
static PROCESS_CWD_CACHE: LazyLock<Mutex<HashMap<String, (String, u128)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
fn list_sessions(state: State<AppState>) -> Result<Vec<IslandSession>, String> {
    let sessions = detect_sessions();
    if let Ok(mut cached_sessions) = state.sessions.lock() {
        *cached_sessions = sessions.clone();
    }
    Ok(sessions)
}

#[tauri::command]
fn list_integrations() -> Result<Vec<IntegrationStatus>, String> {
    Ok(detect_integrations())
}

fn chat_api_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("chat-api.json"))
        .map_err(|error| format!("无法定位聊天 API 配置目录：{error}"))
}

fn load_chat_api_config_from_path(path: &Path) -> Result<ChatApiConfig, String> {
    if !path.exists() {
        return Ok(ChatApiConfig::default());
    }
    let contents =
        fs::read_to_string(path).map_err(|error| format!("无法读取聊天 API 配置：{error}"))?;
    serde_json::from_str(&contents).map_err(|error| format!("聊天 API 配置格式无效：{error}"))
}

fn load_chat_api_config(app: &tauri::AppHandle) -> Result<ChatApiConfig, String> {
    load_chat_api_config_from_path(&chat_api_config_path(app)?)
}

fn normalize_chat_api_config(
    input: ChatApiConfigInput,
    previous_key: &str,
) -> Result<ChatApiConfig, String> {
    let base_url = input.base_url.trim().trim_end_matches('/').to_string();
    if !(base_url.starts_with("https://") || base_url.starts_with("http://")) {
        return Err("API Base URL 必须以 http:// 或 https:// 开头".into());
    }
    let model = input.model.trim().to_string();
    if model.is_empty() {
        return Err("模型名称不能为空".into());
    }
    let supplied_key = input.api_key.unwrap_or_default().trim().to_string();
    Ok(ChatApiConfig {
        enabled: input.enabled,
        base_url,
        api_key: if supplied_key.is_empty() {
            previous_key.into()
        } else {
            supplied_key
        },
        model,
        system_prompt: input.system_prompt.trim().to_string(),
    })
}

fn save_chat_api_config_to_path(path: &Path, config: &ChatApiConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建聊天 API 配置目录：{error}"))?;
    }
    let contents = serde_json::to_string_pretty(config)
        .map_err(|error| format!("无法序列化聊天 API 配置：{error}"))?;
    fs::write(path, contents).map_err(|error| format!("无法保存聊天 API 配置：{error}"))
}

#[tauri::command]
fn get_chat_api_config(app: tauri::AppHandle) -> Result<ChatApiConfigView, String> {
    let config = load_chat_api_config(&app)?;
    Ok(ChatApiConfigView::from(&config))
}

#[tauri::command]
fn save_chat_api_config(
    app: tauri::AppHandle,
    config: ChatApiConfigInput,
) -> Result<ChatApiConfigView, String> {
    let path = chat_api_config_path(&app)?;
    let previous = load_chat_api_config_from_path(&path)?;
    let config = normalize_chat_api_config(config, &previous.api_key)?;
    save_chat_api_config_to_path(&path, &config)?;
    Ok(ChatApiConfigView::from(&config))
}

async fn request_chat_completion(
    config: &ChatApiConfig,
    messages: Vec<ChatApiMessage>,
) -> Result<ChatApiReply, String> {
    if config.api_key.is_empty() {
        return Err("请先填写 API Key".into());
    }
    let mut request_messages = Vec::new();
    if !config.system_prompt.is_empty() {
        request_messages.push(ChatApiMessage {
            role: "system".into(),
            content: serde_json::Value::String(config.system_prompt.clone()),
        });
    }
    request_messages.extend(messages.into_iter().filter(chat_message_has_content));
    if request_messages.is_empty() {
        return Err("没有可发送的聊天消息".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("无法创建聊天 API 请求：{error}"))?;
    let response = client
        .post(format!("{}/chat/completions", config.base_url))
        .bearer_auth(&config.api_key)
        .json(&serde_json::json!({
            "model": config.model,
            "messages": request_messages,
        }))
        .send()
        .await
        .map_err(|error| format!("聊天 API 请求失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        let detail = detail.chars().take(300).collect::<String>();
        return Err(format!("聊天 API 返回 {status}：{detail}"));
    }
    let completion: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|error| format!("无法解析聊天 API 响应：{error}"))?;
    let content = completion
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "聊天 API 未返回内容".to_string())?;
    Ok(ChatApiReply {
        content,
        requested_model: config.model.clone(),
        model: if completion.model.is_empty() {
            config.model.clone()
        } else {
            completion.model
        },
    })
}

fn chat_message_has_content(message: &ChatApiMessage) -> bool {
    match &message.content {
        serde_json::Value::String(value) => !value.trim().is_empty(),
        serde_json::Value::Array(value) => !value.is_empty(),
        value => !value.is_null(),
    }
}

fn chat_stream_chunk_from_line(line: &str) -> Result<Option<(String, String)>, String> {
    let Some(data) = line.trim().strip_prefix("data:") else {
        return Ok(None);
    };
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return Ok(None);
    }
    let value: serde_json::Value =
        serde_json::from_str(data).map_err(|error| format!("无法解析流式响应：{error}"))?;
    let delta = value["choices"][0]["delta"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let model = value["model"].as_str().unwrap_or_default().to_string();
    Ok(Some((delta, model)))
}

async fn stream_chat_completion(
    app: &tauri::AppHandle,
    config: &ChatApiConfig,
    messages: Vec<ChatApiMessage>,
    request_id: &str,
) -> Result<ChatApiReply, String> {
    if config.api_key.is_empty() {
        return Err("请先填写 API Key".into());
    }
    let mut request_messages = Vec::new();
    if !config.system_prompt.is_empty() {
        request_messages.push(ChatApiMessage {
            role: "system".into(),
            content: serde_json::Value::String(config.system_prompt.clone()),
        });
    }
    request_messages.extend(messages.into_iter().filter(chat_message_has_content));
    if request_messages.is_empty() {
        return Err("没有可发送的聊天消息".into());
    }

    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("无法创建聊天 API 请求：{error}"))?
        .post(format!("{}/chat/completions", config.base_url))
        .bearer_auth(&config.api_key)
        .json(&serde_json::json!({
            "model": config.model,
            "messages": request_messages,
            "stream": true,
        }))
        .send()
        .await
        .map_err(|error| format!("聊天 API 请求失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "聊天 API 返回 {status}：{}",
            detail.chars().take(300).collect::<String>()
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();
    let mut model = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取流式响应失败：{error}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(newline) = buffer.find('\n') {
            let line = buffer[..newline].trim_end_matches('\r').to_string();
            buffer.drain(..=newline);
            if let Some((delta, response_model)) = chat_stream_chunk_from_line(&line)? {
                if !response_model.is_empty() {
                    model = response_model;
                }
                if !delta.is_empty() {
                    content.push_str(&delta);
                    let _ = app.emit(
                        "chat://chunk",
                        ChatStreamChunk {
                            request_id: request_id.into(),
                            delta,
                            model: model.clone(),
                        },
                    );
                }
            }
        }
    }
    if content.is_empty() {
        return Err("聊天 API 未返回内容".into());
    }
    Ok(ChatApiReply {
        content,
        requested_model: config.model.clone(),
        model: if model.is_empty() {
            config.model.clone()
        } else {
            model
        },
    })
}

#[tauri::command]
async fn test_chat_api_config(app: tauri::AppHandle) -> Result<String, String> {
    let config = load_chat_api_config(&app)?;
    let reply = request_chat_completion(
        &config,
        vec![ChatApiMessage {
            role: "user".into(),
            content: serde_json::Value::String("请只回复 OK。".into()),
        }],
    )
    .await?;
    Ok(format!("{}（实际模型：{}）", reply.content, reply.model))
}

#[tauri::command]
async fn send_chat_message(
    app: tauri::AppHandle,
    messages: Vec<ChatApiMessage>,
    request_id: String,
) -> Result<ChatApiReply, String> {
    let config = load_chat_api_config(&app)?;
    stream_chat_completion(&app, &config, messages, &request_id).await
}

#[tauri::command]
fn list_session_history(
    id: String,
    provider: Option<String>,
    session_id: Option<String>,
    cwd: Option<String>,
) -> Result<Vec<SessionHistoryItem>, String> {
    let bridge_identity = parse_bridge_ui_id(&id);
    let history_provider = bridge_identity
        .as_ref()
        .map(|(provider, _session_id)| provider.clone())
        .or(provider)
        .unwrap_or_else(|| "codex".into());
    let session_id = bridge_identity
        .map(|(_provider, session_id)| session_id)
        .or_else(|| {
            session_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .unwrap_or(id);

    let path = if history_provider == "claude" {
        find_claude_history_path(&session_id, cwd.as_deref())
    } else if session_id.starts_with("process:") {
        if let Some(cwd) = cwd
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            find_latest_codex_rollout_path_for_cwd(Path::new(cwd))
        } else {
            find_latest_codex_rollout_path_for_current_dir().or_else(find_latest_codex_rollout_path)
        }
    } else {
        find_codex_rollout_path(&session_id).or_else(|| {
            cwd.as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .and_then(|value| find_latest_codex_rollout_path_for_cwd(Path::new(value)))
        })
    };

    let Some(path) = path else {
        return Ok(Vec::new());
    };
    let contents =
        fs::read_to_string(&path).map_err(|error| format!("无法读取会话历史：{error}"))?;
    let mut history = if history_provider == "claude" {
        contents
            .lines()
            .flat_map(claude_history_items_from_jsonl_line)
            .collect::<Vec<_>>()
    } else {
        contents
            .lines()
            .filter_map(history_item_from_jsonl_line)
            .collect::<Vec<_>>()
    };

    dedupe_adjacent_history_items(&mut history);

    if history.len() > 200 {
        history = history.split_off(history.len() - 200);
    }

    Ok(history)
}

#[tauri::command]
fn approve_session(id: String) -> Result<String, String> {
    resolve_approval(&id, true)
}

#[tauri::command]
fn approve_session_for_session(id: String) -> Result<String, String> {
    resolve_approval_for_session(&id)
}

#[tauri::command]
fn reject_session(id: String) -> Result<String, String> {
    resolve_approval(&id, false)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn import_pet_asset(app: tauri::AppHandle) -> Result<PetAsset, String> {
    let picked = rfd::FileDialog::new()
        .set_title("导入宠物")
        .add_filter("Pet files", &["json", "png", "jpg", "jpeg", "gif", "webp"])
        .pick_file()
        .ok_or_else(|| "已取消导入".to_string())?;

    let extension = picked
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "json" {
        import_pet_manifest(&app, &picked)
    } else {
        import_pet_image(&app, &picked)
    }
}

#[tauri::command]
fn focus_session(id: String) -> Result<String, String> {
    let provider_id = provider_id_from_session_id(&id);
    let definition = integration_definitions()
        .into_iter()
        .find(|definition| definition.id == provider_id.as_str())
        .ok_or_else(|| format!("未知集成：{provider_id}"))?;

    if definition.app_name.is_none() && definition.bundle_id.is_none() {
        return Err(format!(
            "{} 是 CLI 集成；当前只能检测进程，还不能定位它所在的终端窗口",
            definition.name
        ));
    }

    activate_integration(&definition)?;
    Ok(format!("已跳回 {}", definition.name))
}

fn import_pet_manifest(app: &tauri::AppHandle, manifest_path: &Path) -> Result<PetAsset, String> {
    let manifest_text =
        fs::read_to_string(manifest_path).map_err(|error| format!("无法读取 pet.json：{error}"))?;
    let manifest: PetManifest = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("pet.json 格式不正确：{error}"))?;
    let manifest_dir = manifest_path
        .parent()
        .ok_or_else(|| "无法定位 pet.json 所在目录".to_string())?;
    let spritesheet_path = manifest
        .spritesheet_path
        .as_deref()
        .unwrap_or("spritesheet.webp");
    let spritesheet_source = manifest_dir.join(spritesheet_path);

    if !spritesheet_source.exists() {
        return Err(format!(
            "找不到 spritesheet：{}",
            spritesheet_source.display()
        ));
    }

    let display_name = manifest
        .display_name
        .or(manifest.name)
        .unwrap_or_else(|| title_from_path(manifest_path));
    let id_seed = manifest
        .id
        .unwrap_or_else(|| file_stem(manifest_path).unwrap_or_else(|| "pet".into()));
    let id = unique_pet_id(&id_seed);
    let asset_path = copy_pet_file(app, &id, &spritesheet_source)?;

    Ok(PetAsset {
        id,
        name: display_name,
        kind: "atlas".into(),
        asset_path: path_to_string(&asset_path),
        columns: 8,
        rows: 9,
        width: 128,
        height: 139,
    })
}

fn import_pet_image(app: &tauri::AppHandle, image_path: &Path) -> Result<PetAsset, String> {
    let name = title_from_path(image_path);
    let id = unique_pet_id(&file_stem(image_path).unwrap_or_else(|| "pet".into()));
    let asset_path = copy_pet_file(app, &id, image_path)?;
    let kind = if looks_like_spritesheet(image_path) {
        "atlas"
    } else {
        "image"
    };

    Ok(PetAsset {
        id,
        name,
        kind: kind.into(),
        asset_path: path_to_string(&asset_path),
        columns: 8,
        rows: 9,
        width: 128,
        height: 139,
    })
}

fn copy_pet_file(app: &tauri::AppHandle, pet_id: &str, source: &Path) -> Result<PathBuf, String> {
    let file_name = source
        .file_name()
        .ok_or_else(|| "无法读取文件名".to_string())?;
    let pet_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法访问应用数据目录：{error}"))?
        .join("pets")
        .join(pet_id);

    fs::create_dir_all(&pet_dir).map_err(|error| format!("无法创建宠物目录：{error}"))?;
    let destination = pet_dir.join(file_name);
    fs::copy(source, &destination).map_err(|error| format!("无法复制宠物文件：{error}"))?;
    Ok(destination)
}

fn unique_pet_id(seed: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("custom-{timestamp}-{}", sanitize_id(seed))
}

fn sanitize_id(value: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;

    for character in value.chars() {
        let next = if character.is_ascii_alphanumeric() {
            previous_dash = false;
            Some(character.to_ascii_lowercase())
        } else if !previous_dash {
            previous_dash = true;
            Some('-')
        } else {
            None
        };

        if let Some(next) = next {
            output.push(next);
        }
    }

    let output = output.trim_matches('-').to_string();
    if output.is_empty() {
        "pet".into()
    } else {
        output
    }
}

fn title_from_path(path: &Path) -> String {
    file_stem(path)
        .map(|stem| stem.replace(['_', '-'], " "))
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| "Imported Pet".into())
}

fn file_stem(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
}

fn looks_like_spritesheet(path: &Path) -> bool {
    file_stem(path)
        .map(|stem| {
            let stem = stem.to_ascii_lowercase();
            stem.contains("spritesheet") || stem.contains("sprite-sheet") || stem.contains("atlas")
        })
        .unwrap_or(false)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn find_codex_rollout_path(session_id: &str) -> Option<PathBuf> {
    let root = env::var_os("HOME")
        .map(PathBuf::from)?
        .join(".codex")
        .join("sessions");
    find_jsonl_file_containing(&root, session_id)
}

fn find_claude_history_path(session_id: &str, cwd: Option<&str>) -> Option<PathBuf> {
    let root = env::var_os("HOME")
        .map(PathBuf::from)?
        .join(".claude")
        .join("projects");
    find_jsonl_file_containing(&root, session_id).or_else(|| {
        cwd.map(str::trim)
            .filter(|value| !value.is_empty())
            .and_then(|value| latest_claude_jsonl_for_cwd(&root, Path::new(value)))
            .map(|(path, _modified)| path)
    })
}

fn latest_claude_jsonl_for_cwd(root: &Path, cwd: &Path) -> Option<(PathBuf, SystemTime)> {
    let entries = fs::read_dir(root).ok()?;
    let mut latest: Option<(PathBuf, SystemTime)> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(candidate) = latest_claude_jsonl_for_cwd(&path, cwd) {
                if latest
                    .as_ref()
                    .map(|(_path, modified)| candidate.1 > *modified)
                    .unwrap_or(true)
                {
                    latest = Some(candidate);
                }
            }
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) != Some("jsonl")
            || !claude_history_matches_cwd(&path, cwd)
        {
            continue;
        }

        let modified = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH);
        if latest
            .as_ref()
            .map(|(_path, previous)| modified > *previous)
            .unwrap_or(true)
        {
            latest = Some((path, modified));
        }
    }

    latest
}

fn claude_history_matches_cwd(path: &Path, cwd: &Path) -> bool {
    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    BufReader::new(file).lines().take(30).flatten().any(|line| {
        serde_json::from_str::<serde_json::Value>(&line)
            .ok()
            .and_then(|value| {
                value
                    .get("cwd")
                    .and_then(|entry| entry.as_str())
                    .map(str::to_string)
            })
            .map(|history_cwd| Path::new(&history_cwd) == cwd)
            .unwrap_or(false)
    })
}

fn find_latest_codex_rollout_path_for_current_dir() -> Option<PathBuf> {
    let current_dir = env::current_dir().ok()?;
    find_latest_codex_rollout_path_for_cwd(&current_dir)
}

fn find_latest_codex_rollout_path_for_cwd(cwd: &Path) -> Option<PathBuf> {
    let root = env::var_os("HOME")
        .map(PathBuf::from)?
        .join(".codex")
        .join("sessions");
    latest_jsonl_for_cwd(&root, cwd).map(|(path, _modified)| path)
}

fn find_latest_codex_rollout_path() -> Option<PathBuf> {
    let root = env::var_os("HOME")
        .map(PathBuf::from)?
        .join(".codex")
        .join("sessions");
    latest_jsonl_file(&root).map(|(path, _modified)| path)
}

fn find_jsonl_file_containing(root: &Path, needle: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_jsonl_file_containing(&path, needle) {
                return Some(found);
            }
            continue;
        }

        let is_jsonl = path.extension().and_then(|value| value.to_str()) == Some("jsonl");
        let matches_session = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|name| name.contains(needle))
            .unwrap_or(false);
        if is_jsonl && matches_session {
            return Some(path);
        }
    }

    None
}

fn latest_jsonl_file(root: &Path) -> Option<(PathBuf, SystemTime)> {
    let entries = fs::read_dir(root).ok()?;
    let mut latest: Option<(PathBuf, SystemTime)> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(candidate) = latest_jsonl_file(&path) {
                if latest
                    .as_ref()
                    .map(|(_path, modified)| candidate.1 > *modified)
                    .unwrap_or(true)
                {
                    latest = Some(candidate);
                }
            }
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
            continue;
        }

        let modified = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH);
        if latest
            .as_ref()
            .map(|(_path, previous)| modified > *previous)
            .unwrap_or(true)
        {
            latest = Some((path, modified));
        }
    }

    latest
}

fn latest_jsonl_for_cwd(root: &Path, cwd: &Path) -> Option<(PathBuf, SystemTime)> {
    let entries = fs::read_dir(root).ok()?;
    let mut latest: Option<(PathBuf, SystemTime)> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(candidate) = latest_jsonl_for_cwd(&path, cwd) {
                if latest
                    .as_ref()
                    .map(|(_path, modified)| candidate.1 > *modified)
                    .unwrap_or(true)
                {
                    latest = Some(candidate);
                }
            }
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
            continue;
        }
        if !rollout_matches_cwd(&path, cwd) {
            continue;
        }

        let modified = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH);
        if latest
            .as_ref()
            .map(|(_path, previous)| modified > *previous)
            .unwrap_or(true)
        {
            latest = Some((path, modified));
        }
    }

    latest
}

fn rollout_matches_cwd(path: &Path, cwd: &Path) -> bool {
    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    if reader
        .read_line(&mut first_line)
        .ok()
        .filter(|size| *size > 0)
        .is_none()
    {
        return false;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&first_line) else {
        return false;
    };
    if value.get("type").and_then(|entry| entry.as_str()) != Some("session_meta") {
        return false;
    }

    value
        .get("payload")
        .and_then(|payload| payload.get("cwd"))
        .and_then(|entry| entry.as_str())
        .map(|rollout_cwd| Path::new(rollout_cwd) == cwd)
        .unwrap_or(false)
}

fn claude_history_items_from_jsonl_line(line: &str) -> Vec<SessionHistoryItem> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return Vec::new();
    };
    let entry_type = value
        .get("type")
        .and_then(|entry| entry.as_str())
        .unwrap_or("");
    if entry_type != "user" && entry_type != "assistant" {
        return Vec::new();
    }

    let timestamp = value
        .get("timestamp")
        .and_then(|entry| entry.as_str())
        .unwrap_or("")
        .to_string();
    let role = if entry_type == "user" {
        "user"
    } else {
        "assistant"
    };
    let title = if entry_type == "user" {
        "你"
    } else {
        "Claude"
    };
    let Some(content) = value
        .get("message")
        .and_then(|message| message.get("content"))
    else {
        return Vec::new();
    };

    if let Some(text) = content.as_str() {
        return claude_text_history_item(role, title, text, &timestamp)
            .into_iter()
            .collect();
    }

    content
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|block| claude_content_block_history_item(block, role, title, &timestamp))
        .collect()
}

fn claude_content_block_history_item(
    block: &serde_json::Value,
    role: &str,
    title: &str,
    timestamp: &str,
) -> Option<SessionHistoryItem> {
    match block.get("type").and_then(|entry| entry.as_str())? {
        "text" => claude_text_history_item(
            role,
            title,
            block
                .get("text")
                .and_then(|entry| entry.as_str())
                .unwrap_or(""),
            timestamp,
        ),
        "tool_use" => {
            let name = block
                .get("name")
                .and_then(|entry| entry.as_str())
                .unwrap_or("工具");
            let detail = block
                .get("input")
                .filter(|entry| !entry.is_null())
                .and_then(|entry| serde_json::to_string_pretty(entry).ok())
                .map(|entry| compact_detail(&entry))
                .unwrap_or_default();
            Some(SessionHistoryItem {
                role: "tool".into(),
                kind: "command".into(),
                title: name.to_string(),
                message: format!("调用 {name}"),
                detail,
                status: "completed".into(),
                timestamp: timestamp.to_string(),
            })
        }
        _ => None,
    }
}

fn claude_text_history_item(
    role: &str,
    title: &str,
    text: &str,
    timestamp: &str,
) -> Option<SessionHistoryItem> {
    let message = compact_history_message(text);
    if message.trim().is_empty() {
        return None;
    }
    Some(SessionHistoryItem {
        role: role.into(),
        kind: "message".into(),
        title: title.into(),
        message,
        detail: String::new(),
        status: String::new(),
        timestamp: timestamp.into(),
    })
}

fn history_item_from_jsonl_line(line: &str) -> Option<SessionHistoryItem> {
    let value = serde_json::from_str::<serde_json::Value>(line).ok()?;
    let event_type = value.get("type").and_then(|entry| entry.as_str())?;
    let payload = value.get("payload")?;

    let (role, kind, title, message, detail, status) = match event_type {
        "event_msg" => match payload.get("type").and_then(|entry| entry.as_str())? {
            "user_message" => text_history_item("user", "你", payload.get("message")?.as_str()?),
            "agent_message" => {
                text_history_item("assistant", "Codex", payload.get("message")?.as_str()?)
            }
            "patch_apply_end" => patch_history_item(payload)?,
            "exec_command_end" => command_history_item(payload)?,
            _ => return None,
        },
        "response_item" => match payload.get("type").and_then(|entry| entry.as_str())? {
            "custom_tool_call" => custom_tool_history_item(payload)?,
            _ => return None,
        },
        _ => return None,
    };

    if message.trim().is_empty() && detail.trim().is_empty() {
        return None;
    }

    Some(SessionHistoryItem {
        role: role.into(),
        kind: kind.into(),
        title,
        message,
        detail,
        status,
        timestamp: value
            .get("timestamp")
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

fn text_history_item(
    role: &'static str,
    title: &str,
    message: &str,
) -> (&'static str, &'static str, String, String, String, String) {
    (
        role,
        "message",
        title.to_string(),
        compact_history_message(message),
        String::new(),
        String::new(),
    )
}

fn patch_history_item(
    payload: &serde_json::Value,
) -> Option<(&'static str, &'static str, String, String, String, String)> {
    let changes = payload.get("changes")?.as_object()?;
    if changes.is_empty() {
        return None;
    }

    let success = payload
        .get("success")
        .and_then(|entry| entry.as_bool())
        .unwrap_or(true);
    let mut file_names = Vec::new();
    let mut detail_sections = Vec::new();
    for (path, change) in changes {
        let path = compact_path(path);
        file_names.push(path.clone());
        let change_type = change
            .get("type")
            .and_then(|entry| entry.as_str())
            .unwrap_or("update");
        let diff = change
            .get("unified_diff")
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .trim();
        let title = format!("{path} ({change_type})");
        if diff.is_empty() {
            detail_sections.push(title);
        } else {
            detail_sections.push(format!("{title}\n{diff}"));
        }
    }

    let message = if file_names.len() == 1 {
        file_names.remove(0)
    } else {
        format!("{} 个文件", file_names.len())
    };
    let detail = compact_detail(&detail_sections.join("\n\n"));
    Some((
        "tool",
        "patch",
        "代码修改".into(),
        message,
        detail,
        if success { "completed" } else { "failed" }.into(),
    ))
}

fn custom_tool_history_item(
    payload: &serde_json::Value,
) -> Option<(&'static str, &'static str, String, String, String, String)> {
    match payload.get("name").and_then(|entry| entry.as_str())? {
        "apply_patch" => custom_patch_history_item(payload),
        _ => None,
    }
}

fn custom_patch_history_item(
    payload: &serde_json::Value,
) -> Option<(&'static str, &'static str, String, String, String, String)> {
    let input = payload
        .get("input")
        .and_then(|entry| entry.as_str())
        .unwrap_or("")
        .trim();
    if input.is_empty() {
        return None;
    }

    let file_names = patch_input_file_names(input);
    let message = if file_names.len() == 1 {
        file_names[0].clone()
    } else if file_names.is_empty() {
        "补丁内容".into()
    } else {
        format!("{} 个文件", file_names.len())
    };
    let status = payload
        .get("status")
        .and_then(|entry| entry.as_str())
        .unwrap_or("completed")
        .to_string();

    Some((
        "tool",
        "patch",
        "代码修改".into(),
        message,
        compact_detail(input),
        status,
    ))
}

fn patch_input_file_names(input: &str) -> Vec<String> {
    let mut file_names = Vec::new();
    for line in input.lines().map(str::trim) {
        let path = line
            .strip_prefix("*** Update File: ")
            .or_else(|| line.strip_prefix("*** Add File: "))
            .or_else(|| line.strip_prefix("*** Delete File: "));
        let Some(path) = path else {
            continue;
        };
        let compact = compact_path(path);
        if !file_names.contains(&compact) {
            file_names.push(compact);
        }
    }
    file_names
}

fn command_history_item(
    payload: &serde_json::Value,
) -> Option<(&'static str, &'static str, String, String, String, String)> {
    let command = payload.get("command")?;
    let command = if let Some(parts) = command.as_array() {
        parts
            .iter()
            .filter_map(|part| part.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        command.as_str().unwrap_or("").to_string()
    };
    let command = command.trim();
    if command.is_empty() {
        return None;
    }

    let status = payload
        .get("status")
        .and_then(|entry| entry.as_str())
        .unwrap_or("completed");
    let exit_code = payload
        .get("exit_code")
        .and_then(|entry| entry.as_i64())
        .map(|code| format!("退出码 {code}"))
        .unwrap_or_default();
    let output = payload
        .get("formatted_output")
        .or_else(|| payload.get("aggregated_output"))
        .or_else(|| payload.get("stdout"))
        .and_then(|entry| entry.as_str())
        .unwrap_or("")
        .trim();
    if output.is_empty() && status == "completed" {
        return None;
    }

    let message = if exit_code.is_empty() {
        format!("{} · {status}", compact_command(command))
    } else {
        format!("{} · {status} · {exit_code}", compact_command(command))
    };
    let detail = if output.is_empty() {
        String::new()
    } else {
        compact_detail(output)
    };

    Some((
        "tool",
        "command",
        "运行命令".into(),
        message,
        detail,
        status.to_string(),
    ))
}

fn dedupe_adjacent_history_items(history: &mut Vec<SessionHistoryItem>) {
    history.dedup_by(|right, left| {
        left.role == right.role
            && left.kind == right.kind
            && left.title == right.title
            && left.message == right.message
            && left.detail == right.detail
    });
}

fn compact_path(path: &str) -> String {
    env::current_dir()
        .ok()
        .and_then(|cwd| {
            Path::new(path)
                .strip_prefix(cwd)
                .ok()
                .map(|value| value.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| path.to_string())
}

fn compact_command(value: &str) -> String {
    let characters = value.chars().collect::<Vec<_>>();
    if characters.len() <= 96 {
        value.to_string()
    } else {
        format!("{}...", characters.iter().take(93).collect::<String>())
    }
}

fn compact_detail(value: &str) -> String {
    let characters = value.chars().collect::<Vec<_>>();
    if characters.len() <= 8000 {
        value.to_string()
    } else {
        format!("{}...", characters.iter().take(7997).collect::<String>())
    }
}

fn compact_history_message(value: &str) -> String {
    let collapsed = value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let characters = collapsed.chars().collect::<Vec<_>>();
    if characters.len() <= 2600 {
        collapsed
    } else {
        format!("{}...", characters.iter().take(2597).collect::<String>())
    }
}

fn detect_sessions() -> Vec<IslandSession> {
    let mut sessions = detect_bridge_sessions();
    let codex_cli_processes = running_processes("codex-cli", true);
    let codex_cli_process_count = codex_cli_processes.len();
    append_codex_cli_process_sessions(&mut sessions, codex_cli_processes);
    limit_codex_cli_island_sessions(&mut sessions, codex_cli_process_count);
    sessions
}

fn append_codex_cli_process_sessions(
    sessions: &mut Vec<IslandSession>,
    processes: Vec<RunningProcess>,
) {
    let context = latest_codex_cli_context(sessions);
    let active_codex_cli_sessions = sessions
        .iter()
        .filter(|session| {
            session.provider == "codex"
                && session.kind == "Codex CLI"
                && matches!(
                    session.phase.as_str(),
                    "approval" | "input" | "processing" | "completed"
                )
        })
        .count();

    let missing_process_sessions = processes.len().saturating_sub(active_codex_cli_sessions);
    if missing_process_sessions == 0 {
        return;
    }

    for process in processes.into_iter().take(missing_process_sessions) {
        sessions.push(codex_cli_process_session(process, context.as_ref()));
    }
}

fn limit_codex_cli_island_sessions(
    sessions: &mut Vec<IslandSession>,
    codex_cli_process_count: usize,
) {
    if codex_cli_process_count == 0 {
        return;
    }

    let mut kept = 0usize;
    sessions.retain(|session| {
        if session.provider != "codex" || session.kind != "Codex CLI" {
            return true;
        }

        kept += 1;
        kept <= codex_cli_process_count
    });
}

fn latest_codex_cli_context(sessions: &[IslandSession]) -> Option<IslandSession> {
    sessions
        .iter()
        .filter(|session| session.provider == "codex" && session.kind == "Codex CLI")
        .filter(|session| !session.project.trim().is_empty() || !session.cwd.trim().is_empty())
        .max_by_key(|session| {
            parse_bridge_timestamp_millis(&session.updated_at).unwrap_or_default()
        })
        .cloned()
}

fn codex_cli_process_session(
    process: RunningProcess,
    context: Option<&IslandSession>,
) -> IslandSession {
    let cwd = process
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|cwd| !cwd.is_empty())
        .map(str::to_string)
        .or_else(|| {
            context
                .map(|session| session.cwd.trim().to_string())
                .filter(|cwd| !cwd.is_empty())
        })
        .unwrap_or_default();
    let project = process_session_project(&cwd, context);
    let session_id = if cwd.is_empty() {
        format!("process:codex-cli:{}", process.pid)
    } else {
        format!("process:codex-cli:{}", decision_file_stem(&cwd))
    };

    IslandSession {
        id: session_id.clone(),
        session_id,
        provider: "codex".into(),
        title: project.clone(),
        project,
        kind: "Codex CLI".into(),
        phase: "processing".into(),
        message: short_process_message(&process.args),
        updated_at: "刚刚".into(),
        cwd,
        source: "process".into(),
        needs_approval: false,
        needs_input: false,
    }
}

fn process_session_project(cwd: &str, context: Option<&IslandSession>) -> String {
    if !cwd.trim().is_empty() {
        return project_name_from_cwd(cwd);
    }

    if let Some(cwd) = context
        .map(|session| session.cwd.trim().to_string())
        .filter(|cwd| !cwd.is_empty())
    {
        return project_name_from_cwd(&cwd);
    }

    if let Some(project) = context
        .map(|session| session.project.trim())
        .filter(|project| !project.is_empty() && *project != "终端")
    {
        return project.to_string();
    }

    env::current_dir()
        .ok()
        .and_then(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(|value| value.to_string())
        })
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Codex CLI".into())
}

fn project_name_from_cwd(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(cwd)
        .to_string()
}

fn short_process_message(args: &str) -> String {
    let trimmed = args.trim();
    if trimmed.is_empty() {
        return "检测到 codex 进程正在运行".into();
    }

    let characters = trimmed.chars().collect::<Vec<_>>();
    if characters.len() <= 120 {
        format!("检测到终端进程：{trimmed}")
    } else {
        format!(
            "检测到终端进程：{}...",
            characters.iter().take(117).collect::<String>()
        )
    }
}

fn detect_bridge_sessions() -> Vec<IslandSession> {
    let codex_threads = load_codex_threads();
    let codex_cli_process_count = running_process_count("codex-cli");
    let mut bridge_sessions = ["codex", "claude"]
        .into_iter()
        .flat_map(load_bridge_sessions)
        .filter(|session| !session.session_id.trim().is_empty())
        .filter(|session| {
            session.provider != "codex" || bridge_codex_session_should_show(session, &codex_threads)
        })
        .collect::<Vec<_>>();

    bridge_sessions.sort_by(|left, right| {
        bridge_session_priority(left)
            .cmp(&bridge_session_priority(right))
            .then_with(|| {
                bridge_session_sort_millis(left, &codex_threads)
                    .cmp(&bridge_session_sort_millis(right, &codex_threads))
                    .reverse()
            })
    });

    collapse_processing_behind_attention_sessions(&mut bridge_sessions);
    limit_codex_processing_sessions(&mut bridge_sessions, codex_cli_process_count);

    bridge_sessions
        .into_iter()
        .map(|session| {
            let provider = if session.provider.trim().is_empty() {
                "codex".to_string()
            } else {
                session.provider.clone()
            };
            let phase = bridge_phase_to_ui(&session);
            let project = if !session.project_name.trim().is_empty() {
                session.project_name.clone()
            } else if !session.cwd.trim().is_empty() {
                Path::new(&session.cwd)
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or(&session.cwd)
                    .to_string()
            } else {
                provider_name(&provider).to_string()
            };
            let thread_name = if provider == "codex" {
                codex_threads
                    .get(&session.session_id)
                    .map(|meta| meta.title.as_str())
            } else {
                None
            };
            let title = bridge_session_title(&provider, &project, &session, thread_name);
            let kind = bridge_session_kind(&provider);

            IslandSession {
                id: bridge_ui_id(&provider, &session.session_id),
                session_id: session.session_id,
                provider,
                title,
                project,
                kind,
                phase,
                message: session
                    .latest_message
                    .filter(|message| !message.trim().is_empty())
                    .unwrap_or_else(|| "等待工具事件".into()),
                updated_at: if session.last_activity_at.trim().is_empty() {
                    "刚刚".into()
                } else {
                    session.last_activity_at
                },
                cwd: session.cwd,
                source: "hook".into(),
                needs_approval: session.needs_approval,
                needs_input: session.needs_input,
            }
        })
        .collect()
}

fn collapse_processing_behind_attention_sessions(sessions: &mut Vec<BridgeSession>) {
    let attention_scopes = sessions
        .iter()
        .filter(|session| session.needs_approval || session.needs_input)
        .map(|session| {
            (
                normalized_provider(&session.provider),
                session.cwd.trim().to_string(),
            )
        })
        .collect::<Vec<_>>();

    if attention_scopes.is_empty() {
        return;
    }

    sessions.retain(|session| {
        if !bridge_session_is_processing(session) {
            return true;
        }

        let provider = normalized_provider(&session.provider);
        let cwd = session.cwd.trim();
        !attention_scopes
            .iter()
            .any(|(attention_provider, attention_cwd)| {
                attention_provider == &provider && !cwd.is_empty() && attention_cwd == cwd
            })
    });
}

fn normalized_provider(provider: &str) -> String {
    if provider.trim().is_empty() {
        "codex".into()
    } else {
        provider.to_string()
    }
}

fn limit_codex_processing_sessions(
    sessions: &mut Vec<BridgeSession>,
    codex_cli_process_count: usize,
) {
    let recent_processing_count = sessions
        .iter()
        .filter(|session| session.provider == "codex" && bridge_session_is_processing(session))
        .filter(|session| bridge_session_recently_active(session))
        .count();
    let processing_limit = if codex_cli_process_count > 0 {
        codex_cli_process_count
    } else {
        recent_processing_count
    };
    if processing_limit == 0 {
        return;
    }

    let mut kept_processing = 0usize;
    sessions.retain(|session| {
        if session.provider != "codex" || !bridge_session_is_processing(session) {
            return true;
        }

        if kept_processing < processing_limit {
            kept_processing += 1;
            true
        } else {
            false
        }
    });
}

fn bridge_codex_session_should_show(
    session: &BridgeSession,
    _codex_threads: &HashMap<String, CodexThreadMeta>,
) -> bool {
    session.needs_approval
        || session.needs_input
        || ((bridge_session_is_processing(session) || bridge_session_is_completed(session))
            && bridge_session_recently_active(session))
}

fn bridge_session_is_processing(session: &BridgeSession) -> bool {
    matches!(session.phase.as_str(), "working" | "started" | "progress")
}

fn bridge_session_is_completed(session: &BridgeSession) -> bool {
    matches!(session.phase.as_str(), "done" | "completed")
}

fn bridge_session_recently_active(session: &BridgeSession) -> bool {
    let Some(last_activity_at) = parse_bridge_timestamp_millis(&session.last_activity_at) else {
        return true;
    };
    let now = current_time_millis();
    now.saturating_sub(last_activity_at) <= BRIDGE_ACTIVE_SESSION_TTL_MS
}

fn current_time_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn parse_bridge_timestamp_millis(value: &str) -> Option<u128> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(millis) = trimmed.parse::<u128>() {
        return Some(millis);
    }

    parse_iso_timestamp_millis(trimmed)
}

fn parse_iso_timestamp_millis(value: &str) -> Option<u128> {
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year = parse_fixed_digits(bytes, 0, 4)? as i64;
    let month = parse_fixed_digits(bytes, 5, 2)? as i64;
    let day = parse_fixed_digits(bytes, 8, 2)? as i64;
    let hour = parse_fixed_digits(bytes, 11, 2)? as i64;
    let minute = parse_fixed_digits(bytes, 14, 2)? as i64;
    let second = parse_fixed_digits(bytes, 17, 2)? as i64;

    if bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || !matches!(bytes.get(10), Some(b'T') | Some(b' '))
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&minute)
        || !(0..=60).contains(&second)
    {
        return None;
    }

    let millis = if bytes.get(19) == Some(&b'.') {
        let mut value = 0u128;
        let mut digits = 0usize;
        for byte in bytes.iter().skip(20) {
            if !byte.is_ascii_digit() || digits >= 3 {
                break;
            }
            value = value * 10 + u128::from(byte - b'0');
            digits += 1;
        }
        value * 10u128.pow((3usize.saturating_sub(digits)) as u32)
    } else {
        0
    };

    let days = days_from_civil(year, month, day)?;
    let seconds = days
        .checked_mul(86_400)?
        .checked_add(hour.checked_mul(3_600)?)?
        .checked_add(minute.checked_mul(60)?)?
        .checked_add(second)?;
    if seconds < 0 {
        return None;
    }

    Some((seconds as u128) * 1000 + millis)
}

fn parse_fixed_digits(bytes: &[u8], start: usize, length: usize) -> Option<u32> {
    let mut value = 0u32;
    for byte in bytes.get(start..start + length)? {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value * 10 + u32::from(byte - b'0');
    }
    Some(value)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    let year = year - if month <= 2 { 1 } else { 0 };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era.checked_mul(146_097)?
        .checked_add(day_of_era)?
        .checked_sub(719_468)
}

fn bridge_session_kind(provider: &str) -> String {
    match provider {
        "codex" => "Codex CLI",
        "claude" => "Claude Code CLI",
        _ => "CLI",
    }
    .into()
}

fn bridge_session_priority(session: &BridgeSession) -> u8 {
    if session.needs_approval || session.phase == "need_approval" {
        return 0;
    }

    if session.needs_input || session.phase == "need_input" {
        return 1;
    }

    if matches!(session.phase.as_str(), "working" | "started" | "progress") {
        return 2;
    }

    3
}

fn bridge_session_sort_millis(
    session: &BridgeSession,
    codex_threads: &HashMap<String, CodexThreadMeta>,
) -> u128 {
    let timestamp = codex_threads
        .get(&session.session_id)
        .map(|meta| meta.updated_at.as_str())
        .unwrap_or(&session.last_activity_at);
    parse_bridge_timestamp_millis(timestamp).unwrap_or_default()
}

fn bridge_phase_to_ui(session: &BridgeSession) -> String {
    if session.needs_approval || session.phase == "need_approval" {
        return "approval".into();
    }

    if session.needs_input || session.phase == "need_input" {
        return "input".into();
    }

    match session.phase.as_str() {
        "working" | "started" | "progress" => "processing",
        "done" | "completed" => "completed",
        "error" | "failed" => "failed",
        "archived" | "removed" => "archived",
        _ => "waiting",
    }
    .into()
}

fn bridge_session_title(
    provider: &str,
    project: &str,
    session: &BridgeSession,
    thread_name: Option<&str>,
) -> String {
    if !session.cwd.trim().is_empty() {
        return project_name_from_cwd(&session.cwd);
    }

    if !project.trim().is_empty() {
        return project.trim().to_string();
    }

    let title = session.title.trim();
    if !title.is_empty()
        && !is_generic_bridge_title(provider, title)
        && !title_matches_project(title, project)
    {
        return compact_title(title);
    }

    if let Some(thread_name) = thread_name {
        let thread_name = thread_name.trim();
        if !thread_name.is_empty() {
            return compact_title(thread_name);
        }
    }

    if let Some(message) = session.latest_message.as_deref() {
        let message = message.trim();
        if !message.is_empty() && !is_generic_bridge_message(provider, message) {
            return compact_title(message);
        }
    }

    format!("{} 会话", provider_name(provider))
}

fn title_matches_project(title: &str, project: &str) -> bool {
    let title = title.trim();
    let project = project.trim();
    !title.is_empty() && !project.is_empty() && title.eq_ignore_ascii_case(project)
}

fn is_generic_bridge_title(provider: &str, title: &str) -> bool {
    let normalized = title.trim().to_lowercase();
    let provider_label = provider_name(provider).to_lowercase();
    matches!(
        normalized.as_str(),
        "codex session"
            | "codex 会话"
            | "claude session"
            | "claude 会话"
            | "claude code session"
            | "claude code 会话"
    ) || normalized == format!("{provider_label} session")
        || normalized == format!("{provider_label} 会话")
}

fn is_generic_bridge_message(provider: &str, message: &str) -> bool {
    let normalized = message.trim().to_lowercase();
    normalized == format!("{provider} event: progress")
        || normalized == format!("{provider} event: completed")
        || normalized == "approved from phoenix pet"
        || normalized == "denied from phoenix pet"
}

fn compact_title(value: &str) -> String {
    let trimmed = value.trim();
    let characters = trimmed.chars().collect::<Vec<_>>();
    if characters.len() <= 80 {
        return trimmed.to_string();
    }

    format!("{}...", characters.iter().take(77).collect::<String>())
}

fn load_codex_threads() -> HashMap<String, CodexThreadMeta> {
    let Some(path) = env::var("HOME").ok().map(|home| {
        PathBuf::from(home)
            .join(".codex")
            .join("session_index.jsonl")
    }) else {
        return HashMap::new();
    };

    let Ok(contents) = fs::read_to_string(path) else {
        return HashMap::new();
    };

    contents
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter_map(|value| {
            let id = value.get("id").and_then(|entry| entry.as_str())?.trim();
            let title = value
                .get("thread_name")
                .or_else(|| value.get("threadName"))
                .and_then(|entry| entry.as_str())?
                .trim();
            if id.is_empty() || title.is_empty() {
                return None;
            }
            let updated_at = value
                .get("updated_at")
                .or_else(|| value.get("updatedAt"))
                .and_then(|entry| entry.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            Some((
                id.to_string(),
                CodexThreadMeta {
                    title: compact_title(title),
                    updated_at,
                },
            ))
        })
        .collect()
}

fn bridge_ui_id(provider: &str, session_id: &str) -> String {
    format!("bridge:{provider}:{session_id}")
}

fn provider_id_from_session_id(id: &str) -> String {
    if let Some((provider, _session_id)) = parse_bridge_ui_id(id) {
        return provider;
    }

    id.strip_suffix("-local").unwrap_or(id).to_string()
}

fn parse_bridge_ui_id(id: &str) -> Option<(String, String)> {
    let rest = id.strip_prefix("bridge:")?;
    let (provider, session_id) = rest.split_once(':')?;
    if provider.trim().is_empty() || session_id.trim().is_empty() {
        return None;
    }
    Some((provider.to_string(), session_id.to_string()))
}

fn resolve_approval(id: &str, approved: bool) -> Result<String, String> {
    let (provider, session_id) = resolve_bridge_session_id(id)
        .ok_or_else(|| "没有找到可审批的真实 hook 会话".to_string())?;

    write_approval_decision(&provider, &session_id, approved)?;
    update_bridge_session(&provider, &session_id, |session| {
        session.needs_approval = false;
        session.needs_input = false;
        session.phase = if approved { "working" } else { "error" }.into();
        session.latest_message = Some(if approved {
            "已批准，等待工具继续".into()
        } else {
            "已拒绝，工具调用已停止".into()
        });
        session.last_activity_at = now_millis_string();
    })?;

    Ok(if approved {
        "已向真实审批通道发送批准".into()
    } else {
        "已向真实审批通道发送拒绝".into()
    })
}

fn resolve_approval_for_session(id: &str) -> Result<String, String> {
    let (provider, session_id) = resolve_bridge_session_id(id)
        .ok_or_else(|| "没有找到可审批的真实 hook 会话".to_string())?;

    write_session_allow(&provider, &session_id)?;
    write_approval_decision_value(
        &provider,
        &session_id,
        "approve_session",
        "Allowed for this session from Phoenix Pet",
    )?;
    update_bridge_session(&provider, &session_id, |session| {
        session.needs_approval = false;
        session.needs_input = false;
        session.phase = "working".into();
        session.latest_message = Some("本次会话已允许，等待工具继续".into());
        session.last_activity_at = now_millis_string();
    })?;

    Ok("已允许本次会话的后续审批".into())
}

fn resolve_bridge_session_id(id: &str) -> Option<(String, String)> {
    if let Some(parsed) = parse_bridge_ui_id(id) {
        return Some(parsed);
    }

    ["codex", "claude"].into_iter().find_map(|provider| {
        load_bridge_sessions(provider)
            .into_iter()
            .find(|session| session.session_id == id)
            .map(|session| (provider.to_string(), session.session_id))
    })
}

fn bridge_root() -> Option<PathBuf> {
    if let Some(root) = env::var_os("PHOENIX_PET_HOME") {
        return Some(PathBuf::from(root));
    }

    env::var_os("HOME").map(|home| PathBuf::from(home).join(".phoenix-pet"))
}

fn bridge_sessions_path(provider: &str) -> Option<PathBuf> {
    Some(
        bridge_root()?
            .join("providers")
            .join(provider)
            .join("sessions.json"),
    )
}

fn bridge_decision_path(provider: &str, session_id: &str) -> Option<PathBuf> {
    Some(
        bridge_root()?
            .join("providers")
            .join(provider)
            .join("decisions")
            .join(format!("{}.json", decision_file_stem(session_id))),
    )
}

fn bridge_session_allows_path(provider: &str) -> Option<PathBuf> {
    Some(
        bridge_root()?
            .join("providers")
            .join(provider)
            .join("session-allows.json"),
    )
}

fn load_bridge_sessions(provider: &str) -> Vec<BridgeSession> {
    let Some(path) = bridge_sessions_path(provider) else {
        return Vec::new();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<BridgeSession>>(&contents).unwrap_or_default()
}

fn save_bridge_sessions(provider: &str, sessions: &[BridgeSession]) -> Result<(), String> {
    let path = bridge_sessions_path(provider)
        .ok_or_else(|| "无法定位 Phoenix Pet hook 数据目录".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建 hook 数据目录：{error}"))?;
    }
    let contents = serde_json::to_string_pretty(sessions)
        .map_err(|error| format!("无法序列化会话：{error}"))?;
    fs::write(path, format!("{contents}\n")).map_err(|error| format!("无法写入会话状态：{error}"))
}

fn update_bridge_session<F>(provider: &str, session_id: &str, update: F) -> Result<(), String>
where
    F: Fn(&mut BridgeSession),
{
    let mut sessions = load_bridge_sessions(provider);
    let session = sessions
        .iter_mut()
        .find(|session| session.session_id == session_id)
        .ok_or_else(|| "真实审批会话已经不存在".to_string())?;
    update(session);
    save_bridge_sessions(provider, &sessions)
}

fn write_approval_decision(provider: &str, session_id: &str, approved: bool) -> Result<(), String> {
    write_approval_decision_value(
        provider,
        session_id,
        if approved { "approve" } else { "deny" },
        if approved {
            "Approved from Phoenix Pet"
        } else {
            "Denied from Phoenix Pet"
        },
    )
}

fn write_approval_decision_value(
    provider: &str,
    session_id: &str,
    decision_value: &str,
    message: &str,
) -> Result<(), String> {
    let path = bridge_decision_path(provider, session_id)
        .ok_or_else(|| "无法定位 Phoenix Pet 审批目录".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建审批目录：{error}"))?;
    }
    let decision = ApprovalDecision {
        decision: decision_value.into(),
        message: message.into(),
        decided_at: now_millis_string(),
    };
    let contents = serde_json::to_string_pretty(&decision)
        .map_err(|error| format!("无法序列化审批：{error}"))?;
    fs::write(path, format!("{contents}\n")).map_err(|error| format!("无法写入审批结果：{error}"))
}

fn write_session_allow(provider: &str, session_id: &str) -> Result<(), String> {
    let path = bridge_session_allows_path(provider)
        .ok_or_else(|| "无法定位 Phoenix Pet 会话允许目录".to_string())?;
    let cwd = load_bridge_sessions(provider)
        .into_iter()
        .find(|session| session.session_id == session_id)
        .map(|session| session.cwd)
        .unwrap_or_default();
    let mut allows = if let Ok(contents) = fs::read_to_string(&path) {
        serde_json::from_str::<Vec<serde_json::Value>>(&contents).unwrap_or_default()
    } else {
        Vec::new()
    };
    allows.retain(|entry| {
        entry
            .get("sessionId")
            .and_then(|value| value.as_str())
            .map(|value| value != session_id)
            .unwrap_or(true)
    });
    allows.push(serde_json::json!({
        "sessionId": session_id,
        "cwd": cwd,
        "allowedAt": now_millis_string(),
    }));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建会话允许目录：{error}"))?;
    }
    let contents = serde_json::to_string_pretty(&allows)
        .map_err(|error| format!("无法序列化会话允许状态：{error}"))?;
    fs::write(path, format!("{contents}\n"))
        .map_err(|error| format!("无法写入会话允许状态：{error}"))
}

fn decision_file_stem(session_id: &str) -> String {
    let mut output = String::new();
    for character in session_id.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
            output.push(character);
        } else {
            output.push('_');
        }
    }
    if output.is_empty() {
        "session".into()
    } else {
        output
    }
}

fn now_millis_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn provider_name(provider: &str) -> &'static str {
    match provider {
        "claude" => "Claude Code",
        "codex" => "Codex",
        "gemini" => "Gemini CLI",
        "qoder" => "Qoder",
        "qwen" => "Qwen Code",
        "opencode" => "OpenCode",
        "cursor" => "Cursor",
        _ => "AI 工具",
    }
}

fn detect_integrations() -> Vec<IntegrationStatus> {
    let process_list = process_list().to_lowercase();
    integration_definitions()
        .into_iter()
        .map(|definition| {
            let running = process_list
                .lines()
                .any(|line| process_line_matches_definition(line, &definition));
            let installed = running || is_installed(&definition);
            let status = if running {
                "running"
            } else if installed {
                "installed"
            } else {
                "missing"
            };
            let message = match status {
                "running" => format!("检测到 {} 正在运行", definition.name),
                "installed" => format!("已安装 {}，当前未运行", definition.name),
                _ => format!("未检测到 {}", definition.name),
            };

            IntegrationStatus {
                id: definition.id.into(),
                name: definition.name.into(),
                kind: definition.kind.into(),
                status: status.into(),
                message,
                installed,
                running,
                focusable: definition.app_name.is_some() || definition.bundle_id.is_some(),
            }
        })
        .collect()
}

fn running_process_count(integration_id: &str) -> usize {
    running_processes(integration_id, false).len()
}

fn running_processes(integration_id: &str, include_cwd: bool) -> Vec<RunningProcess> {
    let process_list = process_list();
    let Some(definition) = integration_definitions()
        .into_iter()
        .find(|definition| definition.id == integration_id)
    else {
        return Vec::new();
    };

    process_list
        .lines()
        .filter(|line| process_line_matches_definition(line, &definition))
        .filter_map(parse_running_process)
        .map(|mut process| {
            if include_cwd {
                process.cwd = process_cwd_cached(&process.pid);
            }
            process
        })
        .collect()
}

fn process_line_matches_definition(line: &str, definition: &IntegrationDefinition) -> bool {
    if definition.id == "codex" {
        return process_line_is_codex_app(line);
    }
    if definition.id == "codex-cli" {
        return process_line_is_codex_cli(line);
    }
    if definition.id == "claude" {
        return process_line_is_claude(line);
    }

    let line = line.to_lowercase();
    definition
        .process_patterns
        .iter()
        .any(|pattern| line.contains(&pattern.to_lowercase()))
}

fn process_line_is_claude(line: &str) -> bool {
    let args = parse_running_process(line)
        .map(|process| process.args)
        .unwrap_or_else(|| line.trim().to_string());
    let executable = args.split_whitespace().next().unwrap_or_default();
    let exec_lower = executable.to_lowercase();
    exec_lower == "claude"
        || exec_lower.ends_with("/claude")
        || exec_lower.contains("claude-code")
        || exec_lower.contains("@anthropic-ai/claude-code")
}

fn process_line_is_codex_app(line: &str) -> bool {
    let args = parse_running_process(line)
        .map(|process| process.args)
        .unwrap_or_else(|| line.trim().to_string());
    let executable = args.split_whitespace().next().unwrap_or_default();
    executable
        .to_lowercase()
        .ends_with("/codex.app/contents/macos/codex")
}

fn parse_running_process(line: &str) -> Option<RunningProcess> {
    let trimmed = line.trim();
    let (pid, args) = trimmed.split_once(' ')?;
    if pid.trim().is_empty() || args.trim().is_empty() {
        return None;
    }

    Some(RunningProcess {
        pid: pid.trim().into(),
        args: args.trim().into(),
        cwd: None,
    })
}

fn process_cwd_cached(pid: &str) -> Option<String> {
    let now = current_time_millis();
    if let Ok(cache) = PROCESS_CWD_CACHE.lock() {
        if let Some((cwd, cached_at)) = cache.get(pid) {
            if now.saturating_sub(*cached_at) <= PROCESS_CWD_CACHE_TTL_MS {
                return Some(cwd.clone());
            }
        }
    }

    let cwd = process_cwd(pid)?;
    if let Ok(mut cache) = PROCESS_CWD_CACHE.lock() {
        cache.insert(pid.to_string(), (cwd.clone(), now));
        cache.retain(|_pid, (_cwd, cached_at)| {
            now.saturating_sub(*cached_at) <= PROCESS_CWD_CACHE_TTL_MS
        });
    }
    Some(cwd)
}

fn process_cwd(pid: &str) -> Option<String> {
    let output = Command::new("lsof")
        .args(["-a", "-p", pid, "-d", "cwd", "-Fn"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| line.strip_prefix('n'))
        .map(str::trim)
        .filter(|cwd| !cwd.is_empty())
        .map(str::to_string)
}

fn process_line_is_codex_cli(line: &str) -> bool {
    let args = parse_running_process(line)
        .map(|process| process.args)
        .unwrap_or_else(|| line.trim().to_string());
    let args = args.trim();
    let args_lower = args.to_lowercase();

    if args_lower.contains("/codex.app/") || args_lower.contains("codex app-server") {
        return false;
    }

    if args_lower.contains("phoenix-pet-codex-hook")
        || args_lower.contains("map-hook-event.mjs")
        || args_lower.contains("scripts/map-hook-event")
    {
        return false;
    }

    if args.contains("/node_modules/@openai/codex/") && args.contains("/vendor/") {
        return false;
    }

    let parts = args.split_whitespace().collect::<Vec<_>>();
    parts.iter().enumerate().any(|(index, part)| {
        let Some(name) = Path::new(part).file_name().and_then(|value| value.to_str()) else {
            return false;
        };

        if name != "codex" {
            return false;
        }

        if index == 0 || part.contains('/') {
            return true;
        }

        parts
            .get(index.saturating_sub(1))
            .and_then(|previous| Path::new(previous).file_name())
            .and_then(|value| value.to_str())
            .map(|previous| matches!(previous, "node" | "nodejs" | "env"))
            .unwrap_or(false)
    })
}

fn integration_definitions() -> Vec<IntegrationDefinition> {
    vec![
        IntegrationDefinition {
            id: "codex",
            name: "Codex App",
            kind: "桌面应用",
            command: None,
            app_name: Some("Codex"),
            bundle_id: Some("com.openai.codex"),
            app_paths: &["/Applications/Codex.app"],
            process_patterns: &[
                "/codex.app/contents/macos/codex",
                "/codex.app/contents/resources/codex app-server",
            ],
        },
        IntegrationDefinition {
            id: "codex-cli",
            name: "Codex CLI",
            kind: "CLI",
            command: Some("codex"),
            app_name: None,
            bundle_id: None,
            app_paths: &[],
            process_patterns: &[" codex ", "/codex "],
        },
        IntegrationDefinition {
            id: "claude",
            name: "Claude Code",
            kind: "CLI",
            command: Some("claude"),
            app_name: None,
            bundle_id: None,
            app_paths: &[],
            process_patterns: &[
                "claude-code",
                " claude ",
                "/claude ",
                "@anthropic-ai/claude-code",
            ],
        },
        IntegrationDefinition {
            id: "gemini",
            name: "Gemini CLI",
            kind: "CLI",
            command: Some("gemini"),
            app_name: None,
            bundle_id: None,
            app_paths: &[],
            process_patterns: &[" gemini ", "/gemini "],
        },
        IntegrationDefinition {
            id: "qwen",
            name: "Qwen Code",
            kind: "CLI",
            command: Some("qwen"),
            app_name: None,
            bundle_id: None,
            app_paths: &[],
            process_patterns: &[" qwen ", " qwen-code ", "/qwen "],
        },
        IntegrationDefinition {
            id: "opencode",
            name: "OpenCode",
            kind: "CLI",
            command: Some("opencode"),
            app_name: None,
            bundle_id: None,
            app_paths: &[],
            process_patterns: &[" opencode ", "/opencode "],
        },
        IntegrationDefinition {
            id: "qoder",
            name: "Qoder",
            kind: "桌面应用",
            command: None,
            app_name: Some("Qoder"),
            bundle_id: None,
            app_paths: &["/Applications/Qoder.app"],
            process_patterns: &["/qoder.app/", " qoder "],
        },
        IntegrationDefinition {
            id: "cursor",
            name: "Cursor",
            kind: "桌面应用",
            command: Some("cursor"),
            app_name: Some("Cursor"),
            bundle_id: Some("com.todesktop.230313mzl4w4u92"),
            app_paths: &["/Applications/Cursor.app"],
            process_patterns: &["/cursor.app/contents/macos/cursor"],
        },
    ]
}

fn process_list() -> String {
    Command::new("ps")
        .args(["ax", "-o", "pid=,args="])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .unwrap_or_default()
}

fn is_installed(definition: &IntegrationDefinition) -> bool {
    definition
        .app_paths
        .iter()
        .any(|path| Path::new(path).exists())
        || definition.command.map(command_exists).unwrap_or(false)
}

fn command_exists(command: &str) -> bool {
    Command::new("/bin/zsh")
        .args(["-lc", &format!("command -v {command}")])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn activate_integration(definition: &IntegrationDefinition) -> Result<(), String> {
    if let Some(bundle_id) = definition.bundle_id {
        let script = format!("tell application id \"{bundle_id}\" to activate");
        if Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        if Command::new("open")
            .args(["-b", bundle_id])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
    }

    if let Some(app_name) = definition.app_name {
        if Command::new("open")
            .args(["-a", app_name])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
    }

    Err(format!("无法打开 {}", definition.name))
}

fn start_session_watcher(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut previous = String::new();

        loop {
            let sessions = detect_sessions();
            let serialized = serde_json::to_string(&sessions).unwrap_or_default();
            if serialized != previous {
                if let Ok(mut cached_sessions) = app.state::<AppState>().sessions.lock() {
                    *cached_sessions = sessions.clone();
                }
                let _ = app.emit("sessions://changed", sessions);
                previous = serialized;
            }

            thread::sleep(Duration::from_millis(SESSION_WATCH_INTERVAL_MS));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            sessions: Mutex::new(detect_sessions()),
        })
        .invoke_handler(tauri::generate_handler![
            approve_session,
            approve_session_for_session,
            get_chat_api_config,
            import_pet_asset,
            list_integrations,
            list_session_history,
            list_sessions,
            focus_session,
            quit_app,
            reject_session,
            save_chat_api_config,
            send_chat_message,
            test_chat_api_config
        ])
        .setup(|app| {
            if let Ok(mut cached_sessions) = app.state::<AppState>().sessions.lock() {
                *cached_sessions = detect_sessions();
            }
            start_session_watcher(app.handle().clone());

            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(false);
                let _ = window.set_always_on_top(true);
                let _ = window.set_skip_taskbar(true);
                let _ = window.set_visible_on_all_workspaces(true);
                let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
                let _ = window.set_simple_fullscreen(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Phoenix Pet Island");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    #[test]
    fn chat_api_config_normalizes_values_and_preserves_existing_key() {
        let config = normalize_chat_api_config(
            ChatApiConfigInput {
                enabled: true,
                base_url: " https://example.com/v1/ ".into(),
                api_key: Some(" ".into()),
                model: " model-name ".into(),
                system_prompt: " prompt ".into(),
            },
            "stored-secret",
        )
        .expect("valid config");

        assert_eq!(config.base_url, "https://example.com/v1");
        assert_eq!(config.api_key, "stored-secret");
        assert_eq!(config.model, "model-name");
        assert_eq!(config.system_prompt, "prompt");
    }

    #[test]
    fn chat_api_config_rejects_invalid_base_url() {
        let result = normalize_chat_api_config(
            ChatApiConfigInput {
                enabled: true,
                base_url: "example.com/v1".into(),
                api_key: None,
                model: "model-name".into(),
                system_prompt: String::new(),
            },
            "",
        );

        assert!(result.is_err());
    }

    #[test]
    fn chat_stream_line_extracts_delta_and_model() {
        let line = r#"data: {"model":"vision-model","choices":[{"delta":{"content":"你好"}}]}"#;
        let chunk = chat_stream_chunk_from_line(line)
            .expect("valid stream line")
            .expect("stream chunk");

        assert_eq!(chunk.0, "你好");
        assert_eq!(chunk.1, "vision-model");
        assert!(chat_stream_chunk_from_line("data: [DONE]")
            .expect("done line")
            .is_none());
    }

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn custom_apply_patch_history_includes_file_changes() {
        let line = serde_json::json!({
            "timestamp": "2026-05-10T14:27:23.013Z",
            "type": "response_item",
            "payload": {
                "type": "custom_tool_call",
                "status": "completed",
                "call_id": "call_patch",
                "name": "apply_patch",
                "input": "*** Begin Patch\n*** Update File: /tmp/project/src/main.js\n@@\n-old\n+new\n*** End Patch\n"
            }
        })
        .to_string();

        let item = history_item_from_jsonl_line(&line).expect("patch history item");
        assert_eq!(item.role, "tool");
        assert_eq!(item.kind, "patch");
        assert_eq!(item.title, "代码修改");
        assert_eq!(item.message, "/tmp/project/src/main.js");
        assert!(item
            .detail
            .contains("*** Update File: /tmp/project/src/main.js"));
        assert_eq!(item.status, "completed");
    }

    #[test]
    fn claude_history_includes_text_and_tool_calls() {
        let text_line = serde_json::json!({
            "type": "assistant",
            "timestamp": "2026-06-06T14:12:46.351Z",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "我会检查当前实现。"}]
            }
        })
        .to_string();
        let tool_line = serde_json::json!({
            "type": "assistant",
            "timestamp": "2026-06-06T14:12:46.900Z",
            "message": {
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "name": "Read",
                    "input": {"file_path": "/tmp/project/src/main.js"}
                }]
            }
        })
        .to_string();

        let text_items = claude_history_items_from_jsonl_line(&text_line);
        assert_eq!(text_items.len(), 1);
        assert_eq!(text_items[0].title, "Claude");
        assert_eq!(text_items[0].message, "我会检查当前实现。");

        let tool_items = claude_history_items_from_jsonl_line(&tool_line);
        assert_eq!(tool_items.len(), 1);
        assert_eq!(tool_items[0].role, "tool");
        assert_eq!(tool_items[0].title, "Read");
        assert!(tool_items[0].detail.contains("/tmp/project/src/main.js"));
    }

    fn temp_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        env::temp_dir().join(format!("phoenix-pet-rust-approval-{unique}"))
    }

    fn sample_session(session_id: &str) -> BridgeSession {
        BridgeSession {
            session_id: session_id.into(),
            provider: "codex".into(),
            project_name: "Phoenix-Pet".into(),
            cwd: "/tmp/phoenix-pet".into(),
            title: "Approval Test".into(),
            latest_message: Some("Waiting for approval".into()),
            phase: "need_approval".into(),
            needs_approval: true,
            needs_input: false,
            unread_count: 0,
            last_activity_at: "2026-05-08T00:00:00Z".into(),
        }
    }

    fn write_sample(root: &Path, provider: &str, session: BridgeSession) {
        write_samples(root, provider, vec![session]);
    }

    fn write_samples(root: &Path, provider: &str, sessions: Vec<BridgeSession>) {
        let path = root.join("providers").join(provider).join("sessions.json");
        fs::create_dir_all(path.parent().expect("sessions parent")).expect("create sessions dir");
        let contents = serde_json::to_string_pretty(&sessions).expect("serialize session");
        fs::write(path, format!("{contents}\n")).expect("write session");
    }

    fn write_codex_index(root: &Path, entries: &[(&str, &str, &str)]) {
        let path = root.join(".codex").join("session_index.jsonl");
        fs::create_dir_all(path.parent().expect("index parent")).expect("create codex index dir");
        let contents = entries
            .iter()
            .map(|(id, title, updated_at)| {
                serde_json::json!({
                    "id": id,
                    "thread_name": title,
                    "updated_at": updated_at,
                })
                .to_string()
            })
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(path, format!("{contents}\n")).expect("write codex index");
    }

    #[test]
    fn approve_session_writes_decision_and_updates_bridge_session() {
        let _guard = env_lock().lock().expect("env lock");
        let root = temp_root();
        env::set_var("PHOENIX_PET_HOME", &root);
        write_sample(&root, "codex", sample_session("rust-approval-test"));

        let message = resolve_approval(&bridge_ui_id("codex", "rust-approval-test"), true)
            .expect("approve session");
        assert_eq!(message, "已向真实审批通道发送批准");

        let sessions = load_bridge_sessions("codex");
        assert_eq!(sessions[0].phase, "working");
        assert!(!sessions[0].needs_approval);

        let decision_path =
            bridge_decision_path("codex", "rust-approval-test").expect("decision path");
        let decision: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(decision_path).expect("decision file"))
                .expect("decision json");
        assert_eq!(decision["decision"], "approve");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reject_session_writes_deny_decision_and_marks_error() {
        let _guard = env_lock().lock().expect("env lock");
        let root = temp_root();
        env::set_var("PHOENIX_PET_HOME", &root);
        write_sample(&root, "codex", sample_session("rust-reject-test"));

        let message =
            resolve_approval(&bridge_ui_id("codex", "rust-reject-test"), false).expect("reject");
        assert_eq!(message, "已向真实审批通道发送拒绝");

        let sessions = load_bridge_sessions("codex");
        assert_eq!(sessions[0].phase, "error");
        assert!(!sessions[0].needs_approval);

        let decision_path = bridge_decision_path("codex", "rust-reject-test").expect("decision");
        let decision: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(decision_path).expect("decision file"))
                .expect("decision json");
        assert_eq!(decision["decision"], "deny");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn generic_bridge_title_falls_back_without_session_id() {
        let mut session = sample_session("rust-approval-test");
        session.cwd = String::new();
        session.title = "Codex Session".into();
        session.latest_message = Some("codex event: progress".into());

        assert_eq!(
            bridge_session_title("codex", "Phoenix-Pet", &session, Some("真实会话标题")),
            "Phoenix-Pet"
        );
        assert_eq!(
            bridge_session_title("codex", "Phoenix-Pet", &session, None),
            "Phoenix-Pet"
        );

        session.title = "Phoenix-Pet".into();
        assert_eq!(
            bridge_session_title("codex", "Phoenix-Pet", &session, Some("真实会话标题")),
            "Phoenix-Pet"
        );

        session.title = "Custom Approval".into();
        assert_eq!(
            bridge_session_title("codex", "Phoenix-Pet", &session, Some("真实会话标题")),
            "Phoenix-Pet"
        );

        session.cwd = "/tmp/Romantic".into();
        assert_eq!(
            bridge_session_title("codex", "Phoenix-Pet", &session, Some("真实会话标题")),
            "Romantic"
        );
    }

    #[test]
    fn codex_cli_process_match_excludes_codex_app() {
        assert!(process_line_is_codex_cli("123 /usr/local/bin/codex"));
        assert!(process_line_is_codex_cli("124 codex --model gpt-5.1"));
        assert!(!process_line_is_codex_cli(
            "125 /Applications/Codex.app/Contents/MacOS/Codex"
        ));
        assert!(!process_line_is_codex_cli(
            "126 /Applications/Codex.app/Contents/Resources/codex app-server"
        ));
        assert!(!process_line_is_codex_cli(
            "127 phoenix-pet-codex-hook progress"
        ));
        assert!(!process_line_is_codex_cli(
            "128 /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex/codex"
        ));
        assert!(!process_line_is_codex_cli(
            "129 node /Users/me/Phoenix-Pet/scripts/map-hook-event.mjs approval_requested --provider codex --quiet 1"
        ));
        assert!(!process_line_is_codex_cli(
            "130 /bin/zsh -c ps -axo pid=,command= | rg -i codex"
        ));
    }

    #[test]
    fn codex_app_process_match_excludes_background_app_server() {
        assert!(process_line_is_codex_app(
            "125 /Applications/Codex.app/Contents/MacOS/Codex"
        ));
        assert!(!process_line_is_codex_app(
            "126 /Applications/Codex.app/Contents/Resources/codex app-server"
        ));
        assert!(!process_line_is_codex_app("127 /usr/local/bin/codex"));
    }

    #[test]
    fn codex_cli_process_session_uses_project_context_as_title() {
        let mut context = sample_session("context-session");
        context.project_name = "Phoenix-Pet".into();
        context.cwd = "/tmp/Phoenix-Pet".into();
        let context_session = IslandSession {
            id: "bridge:codex:context-session".into(),
            session_id: "context-session".into(),
            provider: "codex".into(),
            title: "Phoenix-Pet".into(),
            project: "Phoenix-Pet".into(),
            kind: "Codex CLI".into(),
            phase: "processing".into(),
            message: "codex event: progress".into(),
            updated_at: current_time_millis().to_string(),
            cwd: "/tmp/Phoenix-Pet".into(),
            source: "hook".into(),
            needs_approval: false,
            needs_input: false,
        };

        let session = codex_cli_process_session(
            RunningProcess {
                pid: "123".into(),
                args: "node /opt/homebrew/bin/codex".into(),
                cwd: Some("/tmp/Romantic".into()),
            },
            Some(&context_session),
        );

        assert_eq!(session.title, "Romantic");
        assert_eq!(session.project, "Romantic");
        assert_eq!(session.cwd, "/tmp/Romantic");
        assert_eq!(session.id, "process:codex-cli:_tmp_Romantic");

        let session = codex_cli_process_session(
            RunningProcess {
                pid: "456".into(),
                args: "node /opt/homebrew/bin/codex".into(),
                cwd: None,
            },
            Some(&context_session),
        );

        assert_eq!(session.title, "Phoenix-Pet");
        assert_eq!(session.project, "Phoenix-Pet");
        assert_eq!(session.cwd, "/tmp/Phoenix-Pet");
    }

    #[test]
    fn bridge_sessions_follow_recent_codex_threads_with_attention_first() {
        let _guard = env_lock().lock().expect("env lock");
        let root = temp_root();
        env::set_var("PHOENIX_PET_HOME", &root);
        env::set_var("HOME", &root);
        let project_cwd = env::current_dir()
            .expect("current dir")
            .to_string_lossy()
            .to_string();

        let mut sessions = (0..7)
            .map(|index| {
                let mut session = sample_session(&format!("history-{index}"));
                session.title = format!("History {index}");
                session.cwd = project_cwd.clone();
                session.phase = "done".into();
                session.needs_approval = false;
                session.last_activity_at = format!("2026-05-08T00:0{index}:00Z");
                session
            })
            .collect::<Vec<_>>();

        for index in 0..6 {
            let mut current = sample_session(&format!("current-{index}"));
            current.title = format!("Current {index}");
            current.cwd = if index == 0 {
                "/tmp/another-codex-project".into()
            } else {
                project_cwd.clone()
            };
            current.phase = "working".into();
            current.needs_approval = false;
            current.last_activity_at =
                (current_time_millis() - (index as u128 * 60_000)).to_string();
            sessions.push(current);
        }

        let mut input = sample_session("input-session");
        input.title = "Input Session".into();
        input.cwd = project_cwd.clone();
        input.phase = "need_input".into();
        input.needs_approval = false;
        input.needs_input = true;
        input.last_activity_at = "2026-05-06T00:00:00Z".into();
        sessions.push(input);

        let mut approval = sample_session("approval-session");
        approval.title = "Approval Session".into();
        approval.cwd = project_cwd.clone();
        approval.phase = "need_approval".into();
        approval.needs_approval = true;
        approval.last_activity_at = "2026-05-05T00:00:00Z".into();
        sessions.push(approval);

        let mut failed = sample_session("failed-session");
        failed.title = "Failed Session".into();
        failed.cwd = project_cwd.clone();
        failed.phase = "error".into();
        failed.needs_approval = false;
        failed.last_activity_at = "2026-05-09T00:00:00Z".into();
        sessions.push(failed);

        let mut waiting = sample_session("waiting-session");
        waiting.title = "Waiting Session".into();
        waiting.cwd = project_cwd;
        waiting.phase = "waiting".into();
        waiting.needs_approval = false;
        waiting.last_activity_at = "2026-05-10T00:00:00Z".into();
        sessions.push(waiting);

        write_samples(&root, "codex", sessions);
        write_codex_index(
            &root,
            &[
                (
                    "approval-session",
                    "Approval Thread",
                    "2026-05-05T00:00:00Z",
                ),
                ("input-session", "Input Thread", "2026-05-06T00:00:00Z"),
                ("current-5", "Current 5", "2026-05-07T00:05:00Z"),
                ("current-4", "Current 4", "2026-05-07T00:04:00Z"),
                ("current-3", "Current 3", "2026-05-07T00:03:00Z"),
                ("current-2", "Current 2", "2026-05-07T00:02:00Z"),
                ("current-1", "Current 1", "2026-05-07T00:01:00Z"),
                ("history-6", "History 6", "2026-05-08T00:06:00Z"),
            ],
        );

        let visible = detect_bridge_sessions();
        assert_eq!(visible.len(), 3);
        assert_eq!(visible[0].session_id, "approval-session");
        assert_eq!(visible[1].session_id, "input-session");
        assert_eq!(visible[2].session_id, "current-0");
        assert!(visible
            .iter()
            .any(|session| session.session_id == "current-0"));
        assert!(!visible
            .iter()
            .any(|session| session.session_id == "history-6"));
        assert!(!visible
            .iter()
            .any(|session| session.session_id == "failed-session"));
        assert!(!visible
            .iter()
            .any(|session| session.session_id == "waiting-session"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn detected_sessions_only_include_real_bridge_sessions() {
        let _guard = env_lock().lock().expect("env lock");
        let root = temp_root();
        env::set_var("PHOENIX_PET_HOME", &root);
        env::set_var("HOME", &root);

        let mut session = sample_session("active-codex-cli");
        session.title = "Active Codex CLI".into();
        session.phase = "working".into();
        session.needs_approval = false;
        session.last_activity_at = current_time_millis().to_string();
        write_sample(&root, "codex", session);

        let visible = detect_sessions();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].title, "phoenix-pet");
        assert_eq!(visible[0].kind, "Codex CLI");
        assert_eq!(visible[0].source, "hook");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn startup_sessions_collapse_stale_codex_cli_working_records() {
        let _guard = env_lock().lock().expect("env lock");
        let root = temp_root();
        env::set_var("PHOENIX_PET_HOME", &root);
        env::set_var("HOME", &root);

        let mut active = sample_session("active-codex-cli");
        active.title = "Active Codex CLI".into();
        active.phase = "working".into();
        active.needs_approval = false;
        active.last_activity_at = current_time_millis().to_string();

        let mut stale_one = sample_session("stale-codex-cli-one");
        stale_one.title = "Stale Codex CLI One".into();
        stale_one.phase = "working".into();
        stale_one.needs_approval = false;
        stale_one.last_activity_at = "2026-05-09T13:56:35.173Z".into();

        let mut stale_two = sample_session("stale-codex-cli-two");
        stale_two.title = "Stale Codex CLI Two".into();
        stale_two.phase = "working".into();
        stale_two.needs_approval = false;
        stale_two.last_activity_at = "2026-05-09T13:29:38.550Z".into();

        write_samples(&root, "codex", vec![active, stale_one, stale_two]);

        let visible = detect_sessions();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].title, "phoenix-pet");
        assert_eq!(visible[0].kind, "Codex CLI");
        assert!(!visible
            .iter()
            .any(|session| session.session_id == "stale-codex-cli-one"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn approval_session_replaces_same_project_processing_session() {
        let _guard = env_lock().lock().expect("env lock");
        let root = temp_root();
        env::set_var("PHOENIX_PET_HOME", &root);
        env::set_var("HOME", &root);

        let mut processing = sample_session("processing-codex-cli");
        processing.title = "Processing Codex CLI".into();
        processing.phase = "working".into();
        processing.needs_approval = false;
        processing.cwd = "/tmp/same-project".into();
        processing.last_activity_at = current_time_millis().to_string();

        let mut approval = sample_session("approval-codex-cli");
        approval.title = "Approval Codex CLI".into();
        approval.phase = "need_approval".into();
        approval.needs_approval = true;
        approval.cwd = "/tmp/same-project".into();
        approval.last_activity_at = current_time_millis().to_string();

        write_samples(&root, "codex", vec![processing, approval]);

        let visible = detect_sessions();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].title, "same-project");
        assert_eq!(visible[0].phase, "approval");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn codex_cli_island_sessions_are_capped_to_process_count() {
        let mut sessions = vec![
            IslandSession {
                id: "bridge:codex:approval".into(),
                session_id: "approval".into(),
                provider: "codex".into(),
                title: "Approval".into(),
                project: "Project".into(),
                kind: "Codex CLI".into(),
                phase: "approval".into(),
                message: "Waiting".into(),
                updated_at: "3".into(),
                cwd: "/tmp/project".into(),
                source: "hook".into(),
                needs_approval: true,
                needs_input: false,
            },
            IslandSession {
                id: "bridge:codex:working".into(),
                session_id: "working".into(),
                provider: "codex".into(),
                title: "Working".into(),
                project: "Project".into(),
                kind: "Codex CLI".into(),
                phase: "processing".into(),
                message: "Working".into(),
                updated_at: "2".into(),
                cwd: "/tmp/project".into(),
                source: "hook".into(),
                needs_approval: false,
                needs_input: false,
            },
            IslandSession {
                id: "process:codex-cli:1".into(),
                session_id: "process:codex-cli:1".into(),
                provider: "codex".into(),
                title: "Process 1".into(),
                project: "Project".into(),
                kind: "Codex CLI".into(),
                phase: "processing".into(),
                message: "Process".into(),
                updated_at: "刚刚".into(),
                cwd: "/tmp/project".into(),
                source: "process".into(),
                needs_approval: false,
                needs_input: false,
            },
            IslandSession {
                id: "process:codex-cli:2".into(),
                session_id: "process:codex-cli:2".into(),
                provider: "codex".into(),
                title: "Process 2".into(),
                project: "Project".into(),
                kind: "Codex CLI".into(),
                phase: "processing".into(),
                message: "Process".into(),
                updated_at: "刚刚".into(),
                cwd: "/tmp/project".into(),
                source: "process".into(),
                needs_approval: false,
                needs_input: false,
            },
        ];

        limit_codex_cli_island_sessions(&mut sessions, 3);

        assert_eq!(sessions.len(), 3);
        assert!(sessions
            .iter()
            .any(|session| session.id == "bridge:codex:approval"));
        assert!(!sessions
            .iter()
            .any(|session| session.id == "process:codex-cli:2"));
    }

    #[test]
    fn completed_codex_hook_session_prevents_processing_fallback() {
        let mut sessions = vec![IslandSession {
            id: "bridge:codex:completed".into(),
            session_id: "completed".into(),
            provider: "codex".into(),
            title: "Completed".into(),
            project: "Project".into(),
            kind: "Codex CLI".into(),
            phase: "completed".into(),
            message: "Completed".into(),
            updated_at: "刚刚".into(),
            cwd: "/tmp/project".into(),
            source: "hook".into(),
            needs_approval: false,
            needs_input: false,
        }];

        append_codex_cli_process_sessions(
            &mut sessions,
            vec![RunningProcess {
                pid: "123".into(),
                args: "/usr/local/bin/codex".into(),
                cwd: Some("/tmp/project".into()),
            }],
        );

        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].phase, "completed");
    }
}
