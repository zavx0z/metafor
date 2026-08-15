import {fileURLToPath} from "bun"

interface ImportCode {
  main: string
  service: string
}

/**
 * Строго проверяет и собирает browser importer packages.
 *
 * Window importer остаётся ES module для dynamic import, а Service Worker
 * importer собирается как IIFE для выполнения через startup `Function`.
 * Готовый JavaScript возвращается routes без промежуточного runtime-чтения
 * `dist` artifacts.
 */
export async function buildImport(): Promise<ImportCode> {
  const root = fileURLToPath(new URL(".", import.meta.url))
  const main = `${root}/main`
  const service = `${root}/service`

  await Promise.all([typecheck(main), typecheck(service)])

  return {
    main: build(`${main}/main.ts`, "@import/main"),
    service: build(`${service}/index.ts`, "@import/service", "iife"),
  }
}

/** Запускает package-owned strict TypeScript check. */
async function typecheck(cwd: string) {
  const process = Bun.spawn([Bun.which("bun") ?? "bun", "run", "typecheck"], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await process.exited
  if (exitCode !== 0) throw new Error(`Import typecheck failed in ${cwd}`)
}

/** Собирает browser entrypoint отдельным Bun CLI process и возвращает stdout. */
function build(entrypoint: string, packageName: string, format?: "iife") {
  const command = [Bun.which("bun") ?? "bun", "build", entrypoint, "--target=browser"]
  if (format) command.push(`--format=${format}`)

  const result = Bun.spawnSync(command)
  if (result.exitCode !== 0) {
    throw new Error(`${packageName} build failed:\n${new TextDecoder().decode(result.stderr)}`)
  }
  const output = new TextDecoder().decode(result.stdout)
  if (!output) throw new Error(`${packageName} build did not produce an entrypoint`)
  return output
}
