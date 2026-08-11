import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync, statSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {HamiltonianWebPush} from "./web-push.ts"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

describe("Hamiltonian Web Push persistence", () => {
  test("retains VAPID identity and subscriptions across Bun host restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hamiltonian-web-push-"))
    temporaryDirectories.push(directory)
    const storagePath = join(directory, "state.json")
    const first = new HamiltonianWebPush({storagePath, send: async () => {}})
    first.register("service-worker:stable", {
      workerIdentity: "stable",
      deviceId: "device-a",
      subscription: {
        endpoint: "https://push.example.test/subscription/stable",
        keys: {p256dh: "public_key", auth: "auth_key"},
      },
    })

    const payloads: string[] = []
    const restarted = new HamiltonianWebPush({
      storagePath,
      send: async (_subscription, payload) => {
        payloads.push(payload)
      },
    })
    expect(restarted.publicKey).toBe(first.publicKey)
    expect(restarted.snapshots()).toEqual([expect.objectContaining({
      workerEntityId: "service-worker:stable",
      deviceId: "device-a",
    })])
    await restarted.wake("service-worker:stable", {
      kind: "wake-service-worker",
      wakeId: "wake-one",
      wakeProof: "push-only-proof",
      token: "next-host-token",
      serverEntityId: "server:next-host",
    })
    expect(JSON.parse(payloads[0]!)).toEqual({
      kind: "wake-service-worker",
      wakeId: "wake-one",
      wakeProof: "push-only-proof",
      token: "next-host-token",
      serverEntityId: "server:next-host",
    })
    expect(statSync(storagePath).mode & 0o777).toBe(0o600)
  })
})
