type BirthMessage = {
  kind: "birth"
  incarnation: string
  role: string
  version: string
  sha256: string
  source: string
  authority?: EmbodimentAuthority | null
}

type EmbodimentAuthority = {
  hostEpoch: string
  connectionId: string
  holderId: string
  fencingToken: number
  leaseId: string
  expiresAt: number
}

type StopMessage = {kind: "stop"}

type ParentMessage = BirthMessage | StopMessage

type Embodiment = {
  start(): EmbodimentSnapshot
  stop(): EmbodimentSnapshot
}

type EmbodimentSnapshot = {
  runtime: string
  role: string
  incarnation: string
  version: string
  state: string
  authority: EmbodimentAuthority | null
}

let current: Embodiment | null = null

function sha256Hex(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex") as string
}

function send(message: unknown): void {
  process.send?.(message)
}

process.on("message", async (rawMessage) => {
  const message = rawMessage as ParentMessage
  if (message?.kind === "stop") {
    const snapshot = current?.stop() ?? null
    send({kind: "stopped", pid: process.pid, snapshot})
    process.exit(0)
  }

  if (message?.kind !== "birth") return
  try {
    const actualHash = sha256Hex(message.source)
    if (actualHash !== message.sha256) throw new Error("version source SHA-256 mismatch")

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(message.source).toString("base64")}`
    const loaded = await import(moduleUrl) as {
      version?: unknown
      createEmbodiment?: (context: {
        runtime: string
        role: string
        incarnation: string
        authority: EmbodimentAuthority | null
      }) => Embodiment
      describe?: () => string
    }
    if (loaded.version !== message.version) throw new Error("version source identity mismatch")
    if (typeof loaded.createEmbodiment !== "function") throw new Error("missing createEmbodiment export")
    if (typeof loaded.describe !== "function") throw new Error("missing describe export")

    current = loaded.createEmbodiment({
      runtime: "bun-process",
      role: message.role,
      incarnation: message.incarnation,
      authority: message.authority ?? null,
    })
    const snapshot = current.start()
    send({
      kind: "ready",
      pid: process.pid,
      version: message.version,
      sha256: actualHash,
      description: loaded.describe(),
      snapshot,
    })
  } catch (error) {
    send({kind: "error", pid: process.pid, error: error instanceof Error ? error.message : String(error)})
    process.exit(1)
  }
})

process.on("disconnect", () => process.exit(0))

send({kind: "online", pid: process.pid})
