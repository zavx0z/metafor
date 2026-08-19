export type ReferenceTextureStatus = "idle" | "loading" | "ready" | "failed"

export type ReferenceReadinessOptions = Readonly<{
  readStatus(): ReferenceTextureStatus
  renderNextFrame(): Promise<void>
  timeoutMs?: number
  pollMs?: number
  now?: () => number
  wait?: (durationMs: number) => Promise<void>
}>

/** Waits for GPU texture materialization and one later presentation frame. */
export async function waitForReferenceFrame(options: ReferenceReadinessOptions): Promise<void> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 10_000)
  const pollMs = Math.max(1, options.pollMs ?? 16)
  const now = options.now ?? Date.now
  const wait = options.wait ?? ((durationMs: number) => new Promise<void>((resolve) => setTimeout(resolve, durationMs)))
  const deadline = now() + timeoutMs

  while (true) {
    const status = options.readStatus()
    if (status === "ready") break
    if (status === "failed") throw new Error("Blender reference texture failed to materialize")
    if (now() >= deadline) throw new Error(`Blender reference texture timed out after ${timeoutMs}ms`)
    await wait(pollMs)
  }

  await options.renderNextFrame()
}
