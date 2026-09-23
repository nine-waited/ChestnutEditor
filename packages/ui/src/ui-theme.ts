import { useAppStore } from "./store.js";

export type AppTheme = "light" | "chestnut" | "dark";

export const DEFAULT_APP_THEME: AppTheme = "light";

export function resolveAppTheme(value: unknown): AppTheme {
  if (value === "dark" || value === "chestnut") return value;
  return "light";
}

export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function useAppTheme(): AppTheme {
  return useAppStore((s) => s.theme);
}
