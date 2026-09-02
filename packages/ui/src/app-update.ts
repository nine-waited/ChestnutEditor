export const CHESTNUT_GITHUB_REPO = "nine-waited/ChestnutEditor";
export const CHESTNUT_GITHUB_RELEASES_PAGE = `https://github.com/${CHESTNUT_GITHUB_REPO}/releases`;

export interface GithubReleaseRecord {
  tag_name?: unknown;
  prerelease?: unknown;
  draft?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  created_at?: unknown;
}

export type GithubUpdateChannel = "release" | "prerelease";

export interface GithubUpdateTarget {
  channel: GithubUpdateChannel;
  version: string;
  tag: string;
  url: string;
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

function toTarget(record: GithubReleaseRecord, channel: GithubUpdateChannel): GithubUpdateTarget | null {
  const tag = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
  if (!tag) return null;
  const url =
    typeof record.html_url === "string" && record.html_url.startsWith("http")
      ? record.html_url
      : `${CHESTNUT_GITHUB_RELEASES_PAGE}/tag/${encodeURIComponent(tag)}`;
  return {
    channel,
    version: normalizeAppVersion(tag),
    tag,
    url,
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
