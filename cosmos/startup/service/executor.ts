import type {
  PackageExecutor,
  PackageExit,
  ReleaseDependencies,
  ReleaseFactory,
  ReleaseLoader,
  ReleaseRuntime,
  VerifiedArtifact,
} from "@cosmos/release"

export interface BrowserFunctionIdentity {
  readonly env: string | null
  readonly name: string | null
  readonly sha256: string | null
  readonly size: number
  readonly version: string | null
}

export type BrowserFunctionArtifact = VerifiedArtifact<string, BrowserFunctionIdentity>

type BrowserFunctionExecutor = PackageExecutor<
  BrowserFunctionArtifact,
  ReleaseDependencies,
  ReleaseRuntime,
  ReleaseRuntime
>

interface Completion {
  readonly finished: Promise<PackageExit>
  resolve(exit: PackageExit): void
}

/** Service Worker adapter общего package execution lifecycle. */
export function createBrowserFunctionExecutor(
  run: ReleaseLoader["run"],
): BrowserFunctionExecutor {
  const completions = new WeakMap<ReleaseRuntime, Completion>()

  const executor: BrowserFunctionExecutor = {
    async prepare(artifact, dependencies) {
      const module = {exports: {}} as {exports: {default?: ReleaseFactory}}
      run(artifact.executable, {module})
      const factory = module.exports.default
      if (typeof factory !== "function") throw new Error("Release service factory is missing")
      const candidate = await factory(dependencies)
      assertRuntime(candidate)
      return candidate
    },

    async activate(candidate) {
      assertRuntime(candidate)
      try {
        await candidate.start()
      } catch (error) {
        await candidate.destroy().catch(() => {})
        throw error
      }

      const completion = deferredCompletion()
      completions.set(candidate, completion)
      return Object.freeze({
        runtime: candidate,
        finished: completion.finished,
      })
    },

    async destroy(active) {
      const completion = completions.get(active.runtime)
      try {
        await active.runtime.destroy()
      } finally {
        completions.delete(active.runtime)
        completion?.resolve({reason: "destroyed"})
      }
    },
  }
  return Object.freeze(executor)
}

/** Преобразует проверенный package response в platform executable artifact. */
export async function browserFunctionArtifact(response: Response): Promise<BrowserFunctionArtifact> {
  return Object.freeze({
    identity: Object.freeze({
      env: response.headers.get("X-Package-Env"),
      name: response.headers.get("X-Package-Name"),
      sha256: response.headers.get("X-Package-SHA256"),
      size: Number(response.headers.get("X-Package-Size")),
      version: response.headers.get("X-Package-Version"),
    }),
    executable: await response.text(),
  })
}

function assertRuntime(runtime: unknown): asserts runtime is ReleaseRuntime {
  if (
    typeof runtime !== "object"
    || runtime === null
    || typeof (runtime as ReleaseRuntime).start !== "function"
    || typeof (runtime as ReleaseRuntime).fetch !== "function"
    || typeof (runtime as ReleaseRuntime).message !== "function"
    || typeof (runtime as ReleaseRuntime).destroy !== "function"
  ) throw new Error("Release service returned an invalid runtime")
}

function deferredCompletion(): Completion {
  let resolve!: (exit: PackageExit) => void
  const finished = new Promise<PackageExit>((accepted) => {
    resolve = accepted
  })
  return {finished, resolve}
}
