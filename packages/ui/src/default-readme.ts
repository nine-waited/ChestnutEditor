import {
  getDefaultReadmeCnContent,
  getDefaultReadmeEnContent,
  type Locale,
} from "./i18n/messages.js";

export const README_EN_PATH = "README_en.md";
export const README_CN_PATH = "README_cn.md";

export function getDefaultReadmePathForLocale(locale: Locale): string {
  return locale === "zh-CN" ? README_CN_PATH : README_EN_PATH;
}

/** Create bilingual welcome README files when missing. */
export async function ensureDefaultReadme(
  exists: (path: string) => Promise<boolean>,
  write: (path: string, content: string) => Promise<void>,
): Promise<boolean> {
  let created = false;

  if (!(await exists(README_EN_PATH))) {
    await write(README_EN_PATH, getDefaultReadmeEnContent());
    created = true;
  }
  if (!(await exists(README_CN_PATH))) {
    await write(README_CN_PATH, getDefaultReadmeCnContent());
    created = true;
  }

  return created;
}

/** Pick the welcome note to open after vault mount. */
export async function resolveWelcomeReadmePath(
  locale: Locale,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  const preferred = getDefaultReadmePathForLocale(locale);
  if (await exists(preferred)) return preferred;

  const alternate = locale === "zh-CN" ? README_EN_PATH : README_CN_PATH;
  if (await exists(alternate)) return alternate;

  if (await exists("README.md")) return "README.md";

  return preferred;
}
