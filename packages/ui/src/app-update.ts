export const CHESTNUT_GITHUB_REPO = "nine-waited/ChestnutEditor";
export const CHESTNUT_GITHUB_RELEASES_PAGE = `https://github.com/${CHESTNUT_GITHUB_REPO}/releases`;

export interface GithubReleaseRecord {
  tag_name?: unknown;
  prerelease?: unknown;
  draft?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  assets?: unknown;
}

export type GithubUpdateChannel = "release" | "prerelease";

export interface GithubInstallerAsset {
  fileName: string;
  url: string;
  size: number;
}

export interface GithubUpdateTarget {
  channel: GithubUpdateChannel;
  version: string;
  tag: string;
  url: string;
  installer: GithubInstallerAsset | null;
}

export type GithubUpdateCheck =
  | { status: "none" }
  | { status: "up-to-date"; target: GithubUpdateTarget }
  | { status: "update-available"; target: GithubUpdateTarget };

export function normalizeAppVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

export function compareAppVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

function parseVersionParts(raw: string): [number, number, number] {
  const match = normalizeAppVersion(raw).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function releaseTimestamp(record: GithubReleaseRecord): number {
  const raw =
    (typeof record.published_at === "string" && record.published_at) ||
    (typeof record.created_at === "string" && record.created_at) ||
    "";
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

const INSTALLER_NAME = /^Chestnut_[A-Za-z0-9._-]*_x64-setup\.exe$/i;
const GITHUB_ASSET_PREFIX = `https://github.com/${CHESTNUT_GITHUB_REPO}/releases/download/`;
const GH_PROXY_PREFIX = "https://gh-proxy.com/";

export function isChestnutWindowsInstallerName(name: string): boolean {
  const trimmed = name.trim();
  return INSTALLER_NAME.test(trimmed) && !trimmed.includes("/") && !trimmed.includes("\\") && !trimmed.includes("..");
}

export function isGithubInstallerDownloadUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://") || /[\n\r\0\s'"]/.test(trimmed)) {
    return false;
  }
  const inner = trimmed.startsWith(GH_PROXY_PREFIX) ? trimmed.slice(GH_PROXY_PREFIX.length) : trimmed;
  if (!inner.startsWith(GITHUB_ASSET_PREFIX)) return false;
  const rest = inner.slice(GITHUB_ASSET_PREFIX.length);
  const parts = rest.split("/");
  if (parts.length !== 2) return false;
  const [tag, fileName] = parts;
  return Boolean(tag) && /^[A-Za-z0-9._-]+$/.test(tag) && isChestnutWindowsInstallerName(fileName);
}

export function githubInstallerDownloadUrls(url: string): string[] {
  const trimmed = url.trim();
  const inner = trimmed.startsWith(GH_PROXY_PREFIX) ? trimmed.slice(GH_PROXY_PREFIX.length) : trimmed;
  return inner === trimmed ? [inner, `${GH_PROXY_PREFIX}${inner}`] : [inner, trimmed];
}

export function pickWindowsInstallerAsset(assets: unknown, version?: string): GithubInstallerAsset | null {
  if (!Array.isArray(assets)) return null;
  const matches: GithubInstallerAsset[] = [];
  for (const item of assets) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { name?: unknown; browser_download_url?: unknown; size?: unknown };
    const fileName = typeof rec.name === "string" ? rec.name.trim() : "";
    const url = typeof rec.browser_download_url === "string" ? rec.browser_download_url.trim() : "";
    if (!isChestnutWindowsInstallerName(fileName) || !isGithubInstallerDownloadUrl(url)) continue;
    const size = typeof rec.size === "number" && Number.isFinite(rec.size) && rec.size > 0 ? rec.size : 0;
    matches.push({ fileName, url, size });
  }
  if (matches.length === 0) return null;
  if (version) {
    const exact = `Chestnut_${normalizeAppVersion(version)}_x64-setup.exe`.toLowerCase();
    const match = matches.find((asset) => asset.fileName.toLowerCase() === exact);
    if (match) return match;
  }
  return matches[0] ?? null;
}

export function formatInstallerDownloadProgress(received: number, total: number): string {
  const safeTotal = total > 0 ? total : Math.max(received, 1);
  const totalMb = Math.max(1, Math.round(safeTotal / (1024 * 1024)));
  const receivedMb = received / (1024 * 1024);
  const receivedLabel =
    receivedMb < 10 ? receivedMb.toFixed(1).replace(/\.0$/, "") : Math.round(receivedMb).toString();
  return `${receivedLabel}M / ${totalMb}M`;
}

function toTarget(record: GithubReleaseRecord, channel: GithubUpdateChannel): GithubUpdateTarget | null {
  const tag = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
  if (!tag) return null;
  const url =
    typeof record.html_url === "string" && record.html_url.startsWith("http")
      ? record.html_url
      : `${CHESTNUT_GITHUB_RELEASES_PAGE}/tag/${encodeURIComponent(tag)}`;
  const version = normalizeAppVersion(tag);
  return {
    channel,
    version,
    tag,
    url,
    installer: pickWindowsInstallerAsset(record.assets, version),
  };
}

function newest(records: GithubReleaseRecord[]): GithubReleaseRecord | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => releaseTimestamp(b) - releaseTimestamp(a))[0] ?? null;
}

/** Prefer the latest published stable release; otherwise the latest pre-release. */
export function pickGithubUpdateTarget(releases: GithubReleaseRecord[]): GithubUpdateTarget | null {
  const published = releases.filter((item) => item.draft !== true);
  const stable = published.filter((item) => item.prerelease !== true);
  const pickedStable = newest(stable);
  if (pickedStable) return toTarget(pickedStable, "release");
  const pre = published.filter((item) => item.prerelease === true);
  const pickedPre = newest(pre);
  if (pickedPre) return toTarget(pickedPre, "prerelease");
  return null;
}

export function evaluateGithubUpdate(currentVersion: string, releases: GithubReleaseRecord[]): GithubUpdateCheck {
  const target = pickGithubUpdateTarget(releases);
  if (!target) return { status: "none" };
  if (compareAppVersions(currentVersion, target.version) < 0) {
    return { status: "update-available", target };
  }
  return { status: "up-to-date", target };
}

export function parseGithubReleasesJson(raw: string): GithubReleaseRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("unexpected github releases payload");
  return parsed as GithubReleaseRecord[];
}
