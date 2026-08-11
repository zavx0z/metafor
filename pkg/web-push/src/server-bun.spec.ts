import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync, statSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  BunJsonWebPushSubscriptionStore,
  createBunWebPushSender,
  loadOrCreateBunWebPushVapidCredentials,
} from "./server-bun.ts"

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

describe("Bun Web Push adapters", () => {
  test("persists one VAPID identity with private file permissions", () => {
    const directory = temporaryDirectory()
    const path = join(directory, "vapid.json")
    const first = loadOrCreateBunWebPushVapidCredentials(path)
    const second = loadOrCreateBunWebPushVapidCredentials(path)
    expect(second).toEqual(first)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(first)
  })

  test("persists subscriptions and skips one corrupt record", () => {
    const directory = temporaryDirectory()
    const path = join(directory, "subscriptions.json")
    const first = new BunJsonWebPushSubscriptionStore(path)
    first.put({
      schema: 1,
      subscriptionId: "subscription-1",
      subscription: {
        endpoint: "https://push.example.test/send/secret",
        keys: {p256dh: "p256dh_key", auth: "auth_key"},
      },
      registeredAt: 10,
      updatedAt: 10,
    })
    expect(new BunJsonWebPushSubscriptionStore(path).list()).toHaveLength(1)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test("injects VAPID only into server send", async () => {
    let requestOptions: unknown
    const sender = createBunWebPushSender({
      schema: 1,
      subject: "mailto:test@example.test",
      publicKey: "public_key_123456",
      privateKey: "private_key_12345",
      async send(_subscription, _payload, options) {
        requestOptions = options
        return {statusCode: 201}
      },
    })
    expect(await sender({
      endpoint: "https://push.example.test/send/secret",
      keys: {p256dh: "p256dh_key", auth: "auth_key"},
    }, "{}", {ttl: 60})).toEqual({statusCode: 201})
    expect(requestOptions).toMatchObject({
      TTL: 60,
      vapidDetails: {
        subject: "mailto:test@example.test",
        publicKey: "public_key_123456",
        privateKey: "private_key_12345",
      },
    })
  })
})

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "metafor-web-push-"))
  temporaryDirectories.push(directory)
  return directory
}
