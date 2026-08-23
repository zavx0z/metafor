import {observeOpenTabSoak, SOAK_EVIDENCE_SCHEMA, type SoakEvidence} from "./observer.ts"

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}

async function main(): Promise<void> {
  const hostUrl = Bun.argv[2] ?? Bun.env.HAMILTONIAN_URL ?? "http://127.0.0.1:4400"
  const token = Bun.argv[3] ?? Bun.env.HAMILTONIAN_TOKEN ?? ""
  const durationMs = positiveInteger(Bun.env.HAMILTONIAN_SOAK_DURATION_MS, 5 * 60_000)
  const intervalMs = positiveInteger(Bun.env.HAMILTONIAN_SOAK_INTERVAL_MS, 15_000)
  const requestTimeoutMs = positiveInteger(Bun.env.HAMILTONIAN_SOAK_REQUEST_TIMEOUT_MS, 5_000)
  const controller = new AbortController()
  const interrupted = () => controller.abort(new Error("soak interrupted by process signal"))
  process.once("SIGINT", interrupted)
  process.once("SIGTERM", interrupted)

  let evidence: SoakEvidence
  try {
    evidence = await observeOpenTabSoak({
      hostUrl,
      token,
      durationMs,
      intervalMs,
      requestTimeoutMs,
      signal: controller.signal,
    })
  } catch (error) {
    const now = new Date().toISOString()
    evidence = {
      schema: SOAK_EVIDENCE_SCHEMA,
      outcome: "failed",
      endpoint: "invalid",
      startedAt: now,
      finishedAt: now,
      requestedDurationMs: durationMs,
      intervalMs,
      requestTimeoutMs,
      sampleCount: 0,
      identity: null,
      initialCounters: null,
      finalCounters: null,
      progress: null,
      physicalTransitions: {connectionChanges: 0, workerRebirths: 0, detachedSamples: 0},
      samples: [],
      failure: {
        kind: "configuration",
        message: error instanceof Error ? error.message : String(error),
        sampleIndex: null,
      },
    }
  } finally {
    process.removeListener("SIGINT", interrupted)
    process.removeListener("SIGTERM", interrupted)
  }

  process.stdout.write(`${JSON.stringify(evidence)}\n`)
  if (evidence.outcome !== "passed") process.exitCode = 1
}

await main()
