import {
  getDefaultReadmeCnContent,
  getDefaultReadmeEnContent,
  type Locale,
} from "./i18n/messages.js";

export const README_EN_PATH = "README_en.md";
export const README_CN_PATH = "README_cn.md";

/** Default welcome note is always Chinese; English is linked from it. */
export function getDefaultReadmePathForLocale(_locale?: Locale): string {
  return README_CN_PATH;
}

/** Create bilingual welcome README files when missing. */
export async function ensureDefaultReadme(
  exists: (path: string) => Promise<boolean>,
  write: (path: string, content: string) => Promise<void>,
): Promise<boolean> {
  let created = false;

  // Chinese first — primary default welcome note.
  if (!(await exists(README_CN_PATH))) {
    await write(README_CN_PATH, getDefaultReadmeCnContent());
    created = true;
  }
  if (!(await exists(README_EN_PATH))) {
    await write(README_EN_PATH, getDefaultReadmeEnContent());
    created = true;
  }

  return created;
}

/** Pick the welcome note to open after vault mount (prefer Chinese). */
export async function resolveWelcomeReadmePath(
  _locale: Locale,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  if (await exists(README_CN_PATH)) return README_CN_PATH;
  if (await exists(README_EN_PATH)) return README_EN_PATH;
  if (await exists("README.md")) return "README.md";
  return README_CN_PATH;
}
