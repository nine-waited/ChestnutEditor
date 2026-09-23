import { useAppStore } from "./store.js";

export type AppTheme = "light" | "dark";

export const DEFAULT_APP_THEME: AppTheme = "light";

export function resolveAppTheme(value: unknown): AppTheme {
  return value === "dark" ? "dark" : "light";
}

export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function useAppTheme(): AppTheme {
  return useAppStore((s) => s.theme);
}
