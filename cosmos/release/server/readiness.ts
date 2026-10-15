/** Короткие причины сохраняют original и AggregateError без raw context или бесконечного обхода cause. */
export function readinessCauses(error: unknown): string[] {
  const messages: string[] = [], seen = new Set<unknown>()
  const visit = (value: unknown, depth: number) => {
    if (seen.has(value) || depth > 4 || messages.length >= 12) return
    seen.add(value)
    const message = (value instanceof Error ? value.message : String(value)).slice(0, 1000)
    if (!messages.includes(message)) messages.push(message)
    if (value instanceof AggregateError) for (const cause of value.errors) visit(cause, depth + 1)
    if (value instanceof Error && value.cause !== undefined) visit(value.cause, depth + 1)
  }
  visit(error, 0)
  return messages
}

/** Наблюдение последовательных await готовности; не меняет timeout или причинный lifecycle. */
export function createReadinessTrace(owner: "bind" | "quantum", now = () => performance.now()) {
  const started = now(), completed: {phase: string, elapsedMs: number}[] = []
  let phase = "starting", phaseStarted = started, finished = false, interrupted = false
  return {
    async step<T>(name: string, run: () => T | Promise<T>): Promise<T> {
      phase = name
      phaseStarted = now()
      const value = await run()
      completed.push({phase, elapsedMs: Math.round(now() - phaseStarted)})
      return value
    },
    complete() {
      finished = true
      console.debug("[@cosmos/release:readiness]", "readiness complete", {owner, elapsedMs: Math.round(now() - started), completed: [...completed]})
    },
    failed(error: unknown, observation: unknown = null) {
      finished = true
      console.error("[@cosmos/release:readiness]", "readiness failed", {owner, phase, elapsedMs: Math.round(now() - started),
        phaseElapsedMs: Math.round(now() - phaseStarted), completed: [...completed], causes: readinessCauses(error), observation})
    },
    interrupted(observation: unknown = null) {
      if (finished || interrupted) return
      interrupted = true
      console.error("[@cosmos/release:readiness]", "readiness interrupted", {owner, phase, elapsedMs: Math.round(now() - started),
        phaseElapsedMs: Math.round(now() - phaseStarted), completed: [...completed], observation})
    },
  }
}

/** Cleanup каждого захваченного владельца выполняется даже после отказа предыдущего; original не теряется. */
export async function collectReadinessCleanup(error: unknown, cleanup: readonly (() => unknown | Promise<unknown>)[]): Promise<unknown> {
  const errors = [error]
  for (const close of cleanup) try {await close()} catch (failure) {errors.push(failure)}
  return errors.length === 1 ? error : new AggregateError(errors, "Readiness failed and owned cleanup failed", {cause: error})
}

/** Существующий absolute deadline ограничивает сам await, включая RPC без response timeout. */
export async function withinReadinessDeadline<T>(run: () => Promise<T>, deadline: number, phase: string): Promise<T> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error(`${phase} readiness timed out`)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([run(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${phase} readiness timed out`)), remaining)
    })])
  } finally {if (timer !== undefined) clearTimeout(timer)}
}
