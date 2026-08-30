import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.USERPROFILE ?? "";
const transcriptDirs = [
  path.join(home, ".cursor/projects/c-projects-chestnut/agent-transcripts"),
  path.join(home, ".cursor/projects/c-projects-boke/agent-transcripts"),
];
const outPath = path.join(repoRoot, "prompt.log");
const skip = /^(Briefly inform the user about the task result|The above subagent|This is a reminder)/;

function listParentJsonl(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (!fs.statSync(p).isDirectory()) continue;
    const f = path.join(p, `${name}.jsonl`);
    if (fs.existsSync(f)) out.push({ id: name, file: f });
  }
  return out;
}

function extractQueries(file, sourceId) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const items = [];
  let ord = 0;
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.role !== "user") continue;
    let text = "";
    for (const c of obj.message?.content || []) {
      if (c.type === "text") text += c.text;
    }
    const tsMatch = text.match(/<timestamp>(.*?)<\/timestamp>/);
    const ts = tsMatch ? tsMatch[1].trim() : "";
    const m = text.match(/<user_query>([\s\S]*?)<\/user_query>/);
    if (!m) continue;
    let q = m[1].trim();
    if (!q || skip.test(q)) continue;
    q = q
      .replace(/<image>[\s\S]*?<\/image>/g, "")
      .replace(/<image_files>[\s\S]*?<\/image_files>/g, "")
      .replace(/Don't mention to the user that you only have a description of the image\./g, "")
      .trim();
    if (!q) continue;
    items.push({ ts, q, sourceId, ord: ord++ });
  }
  return items;
}

function normalizeKey(q) {
  return q.replace(/\s+/g, " ").trim();
}

function tsKey(item) {
  if (!item.ts) return null;
  const d = Date.parse(item.ts.replace(/,/g, ""));
  return Number.isNaN(d) ? null : d;
}

function lastArchivedCutoff(existing) {
  let last = 0;
  const re = /^#\d+ \[(.*?)]/gm;
  let m;
  while ((m = re.exec(existing))) {
    const d = Date.parse(m[1].replace(/,/g, ""));
    if (!Number.isNaN(d)) last = Math.max(last, d);
  }
  return last;
}

let existing = fs.readFileSync(outPath, "utf8");
if (existing.charCodeAt(0) === 0xfeff) existing = existing.slice(1);

const existingKeys = new Set();
const blockRe = /^#(\d+)(?: \[(.*?)\])?\n([\s\S]*?)(?=\n---\n|\n*$)/gm;
let bm;
let maxNum = 0;
while ((bm = blockRe.exec(existing))) {
  maxNum = Math.max(maxNum, Number(bm[1]));
  existingKeys.add(normalizeKey(bm[3].trim()));
}

const cutoffMs = lastArchivedCutoff(existing);

const all = [];
for (const dir of transcriptDirs) {
  for (const { id, file } of listParentJsonl(dir)) {
    all.push(...extractQueries(file, id));
  }
}

all.sort((a, b) => {
  const ta = tsKey(a) ?? Number.MAX_SAFE_INTEGER;
  const tb = tsKey(b) ?? Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
  return a.ord - b.ord;
});

const toAdd = [];
const seen = new Set(existingKeys);
for (const item of all) {
  const t = tsKey(item);
  if (t == null || t <= cutoffMs) continue;
  const key = normalizeKey(item.q);
  if (seen.has(key)) continue;
  seen.add(key);
  toAdd.push(item);
}

let next = maxNum + 1;
const chunks = [];
for (const item of toAdd) {
  const head = item.ts ? `#${next} [${item.ts}]` : `#${next}`;
  chunks.push(`${head}\n${item.q}\n`);
  next += 1;
}

const total = maxNum + toAdd.length;
const today = new Date().toISOString().slice(0, 10);
const header = `# Chestnut / Boke 项目 — 用户提示词记录
# 来源：Cursor 对话 transcripts（多会话汇总）
# 共 ${total} 条（已排除系统后台任务通知）
# 生成时间：${today}
# 说明：仅用户提示词，不含助手回复；有时间戳时标注
`;

const bodyStart = existing.search(/^#1\b/m);
const body = (bodyStart >= 0 ? existing.slice(bodyStart) : existing).replace(/\s+$/, "");
let out = `${header}\n${body}`;
if (chunks.length) {
  if (!out.trimEnd().endsWith("---")) {
    out += "\n\n---\n";
  } else if (!out.endsWith("\n")) {
    out += "\n";
  }
  out += `\n${chunks.join("\n---\n\n")}`;
  if (!out.endsWith("\n")) out += "\n";
}

fs.writeFileSync(outPath, `\ufeff${out}`, "utf8");
console.log(
  JSON.stringify(
    {
      maxNumBefore: maxNum,
      added: toAdd.length,
      total,
      cutoffIso: cutoffMs ? new Date(cutoffMs).toISOString() : null,
      firstNew: toAdd[0] ? `#${maxNum + 1} ${toAdd[0].q.slice(0, 70)}` : null,
      lastNew: toAdd.length
        ? `#${maxNum + toAdd.length} ${toAdd.at(-1).q.slice(0, 70)}`
        : null,
    },
    null,
    2,
  ),
);
