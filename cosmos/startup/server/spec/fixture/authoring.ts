import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import type {ServerProcessCandidate} from "../../index.ts"

/** Подготавливает файлы настоящего process-примера; регистрацию и выполнение host оставляет сценарию. */
export async function createAuthoringWorkspace() {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-startup-scenario-"))
  const executable = resolve(import.meta.dir, "process.ts")
  const log = join(directory, "events.jsonl")
  const integrity = await artifactIntegrity(await Bun.file(executable).arrayBuffer())
  return {
    directory,
    async candidate(version: string, env: Record<string, string> = {}): Promise<ServerProcessCandidate> {
      return {
        artifact: {executable, identity: {name: "@cosmos/release", env: "server", version, ...integrity}},
        context: {
          cwd: directory,
          env: {COSMOS_RELEASE_DIGEST: version, STAGED_FIXTURE_LOG: log, ...env},
          readyTimeoutMs: 2_000,
          terminationTimeoutMs: 2_000,
        },
      }
    },
    async events(): Promise<{version: string; event: string}[]> {
      return (await Bun.file(log).text()).trim().split("\n").map(line => JSON.parse(line))
    },
    close: () => rm(directory, {recursive: true, force: true}),
  }
}
