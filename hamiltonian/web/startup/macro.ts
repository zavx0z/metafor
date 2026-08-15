import {fileURLToPath} from "bun"

interface StartupCode {
  main: string
  service: string
}

/**
 * Строго проверяет и собирает неизменяемые browser startup packages.
 *
 * Сборки остаются в памяти и возвращаются владельцу routes готовым JavaScript,
 * поэтому server не читает промежуточные `dist` artifacts.
 *
 * @returns Готовый код startup main и Service Worker.
 * @throws Если typecheck или browser build любого startup package завершился
 * неуспешно либо не создал entrypoint.
 */
export async function buildStartup(): Promise<StartupCode> {
  const startup = fileURLToPath(new URL(".", import.meta.url))
  const main = `${startup}/main`
  const service = `${startup}/service`

  await Promise.all([typecheck(main), typecheck(service)])

  return {
    main: build(`${main}/index.ts`, "@startup/main", "/main.js"),
    service: build(`${service}/index.ts`, "@startup/service"),
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
  if (exitCode !== 0) throw new Error(`Startup typecheck failed in ${cwd}`)
}

/** Собирает browser entrypoint отдельным Bun CLI process и возвращает stdout. */
function build(entrypoint: string, packageName: string, external?: string) {
  const command = [Bun.which("bun") ?? "bun", "build", entrypoint, "--target=browser"]
  if (external) command.push(`--external=${external}`)

  const result = Bun.spawnSync(command)
  if (result.exitCode !== 0) {
    throw new Error(`${packageName} build failed:\n${new TextDecoder().decode(result.stderr)}`)
  }
  const output = new TextDecoder().decode(result.stdout)
  if (!output) throw new Error(`${packageName} build did not produce an entrypoint`)
  return output
}
