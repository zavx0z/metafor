import type {BoundaryUpdateMessage} from "boundary"
import type {EnergyEnv} from "./energy.t.ts"

const kind = Bun.env.ENERGY_KIND
const labels = Bun.env.ENERGY_LABELS?.split(",").map((item) => item.trim()).filter(Boolean) ?? []
const capabilities = Bun.env.ENERGY_CAPABILITIES?.split(",").map((item) => item.trim()).filter(Boolean) ?? []
const env: EnergyEnv = {
  kind: kind === "server" || kind === "browser-main" || kind === "worker" || kind === "service-worker" || kind === "desktop-main" || kind === "unknown" ? kind : "server",
  id: Bun.env.ENERGY_ID?.trim() || `energy-${process.pid}`,
  ...(labels.length > 0 ? {labels} : {}),
  ...(capabilities.length > 0 ? {capabilities} : {}),
}
const force = new BroadcastChannel("force")

force.onmessage = (event) => {
  for (const part of (event.data as BoundaryUpdateMessage).parts) {
    switch (part.part) {
      case "z": {
        if (part.op !== "test") break
        if (typeof part.path !== "number" || !Number.isSafeInteger(part.path) || part.path <= 0) break
        if (typeof part.processId !== "number" || !Number.isSafeInteger(part.processId) || part.processId <= 0) break
        if (typeof part.token !== "string" || part.token.length === 0) break
        if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) break

        const value = part.value as Record<string, unknown>
        if (value.kind !== "process-task") break
        if (typeof value.state !== "string" && typeof value.state !== "number") break
        if (value.mass !== undefined && (typeof value.mass !== "object" || value.mass === null || Array.isArray(value.mass))) break

        force.postMessage({
          parts: [{
            part: "z",
            op: "test",
            path: part.path,
            value: {
              kind: "claim",
              processId: part.processId,
              token: part.token,
              env,
              ...(value.mass !== undefined ? {mass: value.mass} : {}),
            },
          }],
        })
        break
      }
    }
  }
}
