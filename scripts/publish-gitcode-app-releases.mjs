/**
 * Publish chestnut-editor-releases.json (and optionally the Windows installer)
 * to GitCode Nineee999/ChestnutResources so in-app updates work in China.
 * Auth: git credential fill for gitcode.com; never print the token.
 */
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "Nineee999";
const REPO = "ChestnutResources";
const API = "https://api.gitcode.com/api/v5";
const FILE_PATH = "chestnut-editor-releases.json";
const ROOT = dirname(fileURLToPath(import.meta.url));
const JSON_FILE = join(ROOT, "..", "resources", "chestnut-editor-releases.json");

function gitCredentialFill(host) {
  const input = `protocol=https\nhost=${host}\n\n`;
  const r = spawnSync("git", ["credential", "fill"], {
    input,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.status !== 0) return null;
  const cred = {};
  for (const line of String(r.stdout || "").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) cred[line.slice(0, i)] = line.slice(i + 1);
  }
  if (!cred.password) return null;
  return cred.password;
}

async function tokenRequest(token, method, url, body) {
  const attempts = [
    { headers: { Authorization: `Bearer ${token}` } },
    { headers: { "PRIVATE-TOKEN": token } },
    { query: true },
  ];
  let last = null;
  for (const mode of attempts) {
    const u = new URL(url);
    const headers = { Accept: "application/json", ...(mode.headers || {}) };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (mode.query) u.searchParams.set("access_token", token);
    const res = await fetch(u, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    last = { ok: res.ok, status: res.status, text, json };
    if (res.ok || res.status === 409 || res.status === 422) return last;
  }
  return last;
}

async function resolveToken() {
  for (const host of ["gitcode.com", "api.gitcode.com"]) {
    const token = gitCredentialFill(host);
    if (!token) continue;
    const me = await tokenRequest(token, "GET", `${API}/user`);
    const login = String(me?.json?.login || me?.json?.username || "");
    if (me?.ok && login.toLowerCase() === "nineee999") {
      console.log(`[login] OK ${login} via ${host}`);
      return token;
    }
  }
  throw new Error("GitCode 凭据无效，已中止。");
}

function b64(buf) {
  return Buffer.from(buf).toString("base64");
}

async function upsertJsonFile(token, content) {
  const encodedPath = FILE_PATH;
  const payload = {
    content: b64(content),
    message: "Update chestnut-editor-releases.json for in-app updates.",
    branch: "main",
  };
  const endpoints = [
    `${API}/repos/${OWNER}/${REPO}/contents/${encodedPath}`,
    `${API}/repos/${OWNER}/${REPO}/files/${encodedPath}`,
  ];
  for (const url of endpoints) {
    const existing = await tokenRequest(token, "GET", url);
    const sha = existing?.json?.sha || existing?.json?.content?.sha;
    const body = sha ? { ...payload, sha } : payload;
    const method = existing?.ok ? "PUT" : "POST";
    const saved = await tokenRequest(token, method, url, body);
    if (saved?.ok) {
      console.log(`[file] ${FILE_PATH} via ${method} ${url}`);
      return;
    }
    console.log(`[file] ${method} ${url} -> ${saved?.status} ${String(saved?.text || "").slice(0, 180)}`);
  }
  throw new Error("无法写入 GitCode 上的 chestnut-editor-releases.json");
}

async function ensureRelease(token, tag, name) {
  const existing = await tokenRequest(token, "GET", `${API}/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  if (existing?.ok) {
    console.log(`[release] 已有 ${tag}`);
    return existing.json;
  }
  const created = await tokenRequest(token, "POST", `${API}/repos/${OWNER}/${REPO}/releases`, {
    tag_name: tag,
    name,
    body: tag === "app-meta"
      ? "Chestnut Editor 检查更新用的 GitHub releases 精简镜像。"
      : "Chestnut Editor Windows 安装包（国内镜像）。",
    target_commitish: "main",
    prerelease: tag !== "app-meta",
  });
  if (!created?.ok) {
    throw new Error(`创建 Release ${tag} 失败 HTTP ${created?.status}: ${String(created?.text || "").slice(0, 300)}`);
  }
  console.log(`[release] 已创建 ${tag}`);
  return created.json;
}

async function uploadNamedAsset(token, tag, filePath, fileName) {
  const listed = await tokenRequest(token, "GET", `${API}/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  const assets = listed?.json?.assets || [];
  const existing = assets.find((a) => a.name === fileName);
  if (existing?.id) {
    const del = await tokenRequest(
      token,
      "DELETE",
      `${API}/repos/${OWNER}/${REPO}/releases/${tag}/attach_files/${existing.id}`,
    );
    console.log(`[upload] 删除旧 ${fileName} -> ${del?.status}`);
  }
  const encoded = encodeURIComponent(fileName);
  const signed = await tokenRequest(
    token,
    "GET",
    `${API}/repos/${OWNER}/${REPO}/releases/${tag}/upload_url?file_name=${encoded}`,
  );
  if (!signed?.ok || !signed.json?.url) {
    throw new Error(`获取上传地址失败 HTTP ${signed?.status}: ${String(signed?.text || "").slice(0, 300)}`);
  }
  const bytes = await readFile(filePath);
  const headers = { ...(signed.json.headers || {}), "Content-Type": "application/octet-stream" };
  const put = await fetch(signed.json.url, { method: "PUT", headers, body: bytes });
  if (!put.ok) {
    throw new Error(`上传 ${fileName} 失败 HTTP ${put.status}: ${(await put.text()).slice(0, 300)}`);
  }
  console.log(`[upload] ${fileName} -> ${tag}`);
}

async function main() {
  const jsonPath = JSON_FILE;
  const token = await resolveToken();
  try {
    await upsertJsonFile(token, await readFile(jsonPath));
  } catch (err) {
    console.log(`[file] 仓库 raw 写入失败，改为 Release 附件：${err.message || err}`);
  }

  await ensureRelease(token, "app-meta", "Chestnut Editor release catalog");
  await uploadNamedAsset(token, "app-meta", jsonPath, "chestnut-editor-releases.json");

  const exe = join(
    ROOT,
    "..",
    "apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Chestnut_0.9.4_x64-setup.exe",
  );
  try {
    await stat(exe);
  } catch {
    console.log("[upload] 本地安装包不存在，跳过 exe 上传");
    return;
  }
  await ensureRelease(token, "v0.9.4", "Chestnut Editor v0.9.4");
  await uploadNamedAsset(token, "v0.9.4", exe, "Chestnut_0.9.4_x64-setup.exe");
}

main().catch((err) => {
  console.error(`[fail] ${err.message || err}`);
  process.exit(1);
});
