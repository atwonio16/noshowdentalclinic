export function logInfo(message: string, meta?: Record<string, unknown>): void {
  if (meta) {
    console.log(`[INFO] ${message}`, meta);
    return;
  }
  console.log(`[INFO] ${message}`);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  if (meta) {
    console.warn(`[WARN] ${message}`, meta);
    return;
  }
  console.warn(`[WARN] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  if (error) {
    console.error(`[ERROR] ${message}`, error);
    return;
  }
  console.error(`[ERROR] ${message}`);
}