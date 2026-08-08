import "/core/traffic.js"

let current = null

self.addEventListener("message", async (event) => {
  const message = event.data
  if (message?.kind === "stop") {
    const snapshot = current?.stop() ?? null
    self.postMessage({kind: "stopped", snapshot})
    self.close()
    return
  }
  if (message?.kind !== "birth") return

  try {
    const loaded = await import(message.moduleUrl)
    if (loaded.version !== message.version) throw new Error("version identity mismatch")
    if (typeof loaded.createEmbodiment !== "function") throw new Error("missing createEmbodiment export")
    current = loaded.createEmbodiment({
      runtime: "dedicated-worker",
      role: "per-window",
      incarnation: message.incarnation,
    })
    const snapshot = current.start()
    self.postMessage({
      kind: "ready",
      version: loaded.version,
      sha256: message.sha256,
      description: loaded.describe(),
      snapshot,
    })
  } catch (error) {
    self.postMessage({kind: "error", error: error instanceof Error ? error.message : String(error)})
  }
})
