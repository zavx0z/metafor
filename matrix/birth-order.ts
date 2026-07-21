const prerequisiteDomains = ["dark", "boundary", "energy", "bulk"] as const

type ForceBirthStatus = {
  state?: unknown
  connectedDomains?: unknown
  error?: unknown
}

export type MatrixBirthGateOptions = {
  waitMs?: number
  retryMs?: number
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const connectedDomains = (status: ForceBirthStatus): string[] =>
  Array.isArray(status.connectedDomains)
    ? status.connectedDomains.filter((domain): domain is string => typeof domain === "string")
    : []

/**
 * Matrix is the last runtime domain to be born: its initial Weak evaluation can
 * immediately emit process work, so the other four Particle consumers must
 * already have ready ForceChannels before Matrix opens its own channel.
 */
export const waitForMatrixBirthGate = async (
  readStatus: () => Promise<ForceBirthStatus>,
  options: MatrixBirthGateOptions = {},
): Promise<void> => {
  const waitMs = options.waitMs ?? 30_000
  const retryMs = options.retryMs ?? 50
  const deadline = Date.now() + waitMs
  let lastReason = "Force status is unavailable"

  while (true) {
    let status: ForceBirthStatus | undefined
    try {
      status = await readStatus()
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error)
    }

    if (status) {
      const connected = connectedDomains(status)

      if (connected.includes("matrix") || status.state === "running") {
        throw new Error("Matrix ForceChannel is already connected before this Matrix runtime was born")
      }
      if (status.state === "error" || status.state === "stopped") {
        throw new Error(
          typeof status.error === "string" && status.error.length > 0
            ? status.error
            : `Force cannot admit Matrix from state: ${String(status.state)}`,
        )
      }
      if (
        status.state === "starting"
        && prerequisiteDomains.every((domain) => connected.includes(domain))
      ) {
        return
      }

      const missing = prerequisiteDomains.filter((domain) => !connected.includes(domain))
      lastReason = missing.length > 0
        ? `waiting for ForceChannels: ${missing.join(", ")}`
        : `Force is not starting: ${String(status.state)}`
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error(`Timed out waiting to birth Matrix last: ${lastReason}`)
    await sleep(Math.min(retryMs, remaining))
  }
}
