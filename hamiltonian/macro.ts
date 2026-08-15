import {file, fileURLToPath, Glob} from "bun"
import {dirname, join} from "node:path"

/** Один встроенный static asset и принадлежащий ему HTTP path. */
export type StaticAssetEntry = [path: string, asset: {body: string; type: string}]

/** Отличия одного artifact от стандартной browser ESM сборки. */
export interface BuildOptions {
  /** Execution target собираемого artifact. */
  target?: "browser" | "bun" | "node"

  /** Module format собираемого artifact. */
  format?: "esm" | "cjs" | "iife"

  /** Imports, которые должны остаться внешними в готовом artifact. */
  external?: readonly string[]

  /** Минифицировать ли готовый artifact. */
  minify?: boolean
}

/**
 * Строго проверяет и собирает один Hamiltonian module.
 *
 * Macro разрешает workspace module через Bun, получает его entrypoint из
 * package `exports`, находит package-владельца и использует его обязательный
 * script `typecheck`. Стандартный профиль — browser ESM; вызывающий владелец
 * передаёт только имя module и отличия конкретного artifact.
 *
 * @param moduleName - Имя workspace module или его экспортируемого subpath.
 * @param options - Отличия artifact от стандартной browser ESM сборки.
 * @returns Исполняемый JavaScript выбранного module.
 * @throws Если typecheck или build завершился неуспешно либо не создал код.
 */
export async function build(moduleName: string, options: BuildOptions = {}): Promise<string> {
  const source = Bun.resolveSync(moduleName, fileURLToPath(new URL(".", import.meta.url)))
  const owner = await findPackage(source)

  await typecheck(owner.name, owner.root)

  const command = [
    Bun.which("bun") ?? "bun",
    "build",
    source,
    `--target=${options.target ?? "browser"}`,
    `--format=${options.format ?? "esm"}`,
  ]

  for (const external of options.external ?? []) command.push(`--external=${external}`)
  if (options.minify) command.push("--minify")

  const result = Bun.spawnSync(command)

  if (result.exitCode !== 0) {
    throw new Error(
      `${owner.name} build failed:\n${new TextDecoder().decode(result.stderr)}`,
    )
  }

  const output = new TextDecoder().decode(result.stdout)
  if (!output) throw new Error(`${owner.name} build did not produce an entrypoint`)
  return output
}

/**
 * Встраивает Hamiltonian static assets в вызывающий route.
 *
 * @returns Отсортированные route path и сериализованные данные assets.
 */
export async function staticAssets(): Promise<StaticAssetEntry[]> {
  const root = fileURLToPath(new URL("./assets", import.meta.url))
  const paths = Array.from(new Glob("**/*").scanSync(root)).sort()

  return await Promise.all(paths.map(async (path): Promise<StaticAssetEntry> => {
    const asset = file(join(root, path))
    const body = new Uint8Array(await asset.arrayBuffer()).toBase64()
    return [`/assets/${path}`, {body, type: asset.type}]
  }))
}

/** Запускает package-owned strict TypeScript check. */
async function typecheck(packageName: string, cwd: string) {
  const process = Bun.spawn([Bun.which("bun") ?? "bun", "run", "typecheck"], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await process.exited
  if (exitCode !== 0) throw new Error(`${packageName} typecheck failed in ${cwd}`)
}

/** Находит package-владельца entrypoint по ближайшему `package.json`. */
async function findPackage(entrypoint: string) {
  const boundary = fileURLToPath(new URL(".", import.meta.url))
  let root = dirname(entrypoint)

  while (root.startsWith(boundary)) {
    const file = Bun.file(join(root, "package.json"))
    if (await file.exists()) {
      const manifest = await file.json() as {name?: unknown; scripts?: {typecheck?: unknown}}
      if (typeof manifest.name !== "string") throw new Error(`Package name is missing in ${root}`)
      if (typeof manifest.scripts?.typecheck !== "string")
        throw new Error(`${manifest.name} typecheck script is missing`)
      return {name: manifest.name, root}
    }

    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }

  throw new Error(`Hamiltonian package is missing for ${entrypoint}`)
}
