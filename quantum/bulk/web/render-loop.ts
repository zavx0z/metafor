export type BulkRenderLoopActivity = {
  navigationActive: boolean
  pendingMotion: boolean
  timestamp: number
  wakeUntilMs: number
}

/** HUD surfaces may request a frame, but do not make the loop perpetual. */
export function shouldContinueBulkRenderLoop(activity: BulkRenderLoopActivity): boolean {
  return activity.navigationActive
    || activity.pendingMotion
    || activity.timestamp < activity.wakeUntilMs
}
