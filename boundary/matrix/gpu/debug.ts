export function debugLog(enabled: boolean, ...args: unknown[]): void {
  if (!enabled) {
    return
  }
  console.log(...args)
}
