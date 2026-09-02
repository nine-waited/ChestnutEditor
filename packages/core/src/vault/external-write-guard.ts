/** Skip writing when disk was changed by another program since Chestnut last loaded/saved it. */
export function shouldSkipWriteOverExternalDisk(input: {
  disk: string | null;
  lastKnown: string | undefined;
  incoming: string;
}): boolean {
  if (input.disk == null || input.lastKnown === undefined) return false;
  if (input.disk === input.incoming) return false;
  if (input.disk === input.lastKnown) return false;
  return true;
}

export type ExternalDiskSyncPlan = "ignore" | "reload" | "conflict";

/** How an open editor should react when the vault file changes on disk. */
export function planExternalDiskSync(input: {
  buffer?: string;
  lastSaved?: string;
  disk: string;
}): ExternalDiskSyncPlan {
  if (input.buffer === undefined || input.lastSaved === undefined) return "reload";
  if (input.disk === input.lastSaved || input.disk === input.buffer) return "ignore";
  if (input.buffer === input.lastSaved) return "reload";
  return "conflict";
}
