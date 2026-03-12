import { file, serve } from "bun"
import { createServer } from "node:net"
import { join } from "node:path"

async function findAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer()

    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("Unable to resolve a free port")))
        return
      }

      const { port } = address
      probe.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })
}

export class HubFixture {
  private server: Bun.Server<any> | undefined
  private readonly nativeFetch = globalThis.fetch

  constructor(private readonly rootDirectory: string) {}

  async setup(): Promise<void> {
    if (this.server) return

    const port = await findAvailablePort()
    this.server = serve({
      port,
      routes: {
        "/*.json": async (req) => {
          try {
            const path = new URL(req.url).pathname
            return new Response(file(join(this.rootDirectory, path)))
          } catch (e) {
            console.error(e)
            return new Response("Not Found", { status: 404 })
          }
        },
      },
    })

    const server = this.server
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (target.startsWith("/")) {
        return this.nativeFetch(new URL(target, server.url), init)
      }

      return this.nativeFetch(input as any, init)
    }) as typeof fetch
  }

  async teardown(): Promise<void> {
    globalThis.fetch = this.nativeFetch
    await this.server?.stop()
    this.server = undefined
  }
}
