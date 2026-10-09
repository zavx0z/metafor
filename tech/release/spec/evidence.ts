import {createHash} from "node:crypto"
import {stat} from "node:fs/promises"
import {join} from "node:path"
import {expect} from "bun:test"
import {resolveVersionedPackageArtifactPath} from "@metafor/tech-release"
import type {releaseFixture} from "./fixture"

export type Workspace = Awaited<ReturnType<typeof releaseFixture>>
export interface FileProof {
  sha256: string
  size: number
  inode: string
  modified: string
}

/** Снимок проверяет байты и физическую неизменность, а не только metadata результата. */
export async function filesBefore(root: string) {
  const paths = await Array.fromAsync(
    new Bun.Glob("{packages/**/dist/versions/**,.release/**}").scan({
      cwd: root,
      absolute: true,
      onlyFiles: true,
      dot: true,
    }),
  )
  return new Map(
    await Promise.all(paths.map(async (path) => [path, await fileProof(path)] as const)),
  )
}
export async function fileProof(path: string): Promise<FileProof> {
  const bytes = await Bun.file(path).arrayBuffer()
  const info = await stat(path, {bigint: true})
  return {
    sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    size: bytes.byteLength,
    inode: `${info.dev}:${info.ino}`,
    modified: info.mtimeNs.toString(),
  }
}
export async function expectPreserved(before: ReadonlyMap<string, FileProof>) {
  for (const [path, original] of before) {
    expect(await fileProof(path), `Подтверждённый файл ${path} не переписан`).toEqual(original)
  }
}
export async function completeArtifacts(workspace: Workspace, versions: Record<string, string>) {
  const artifacts = []
  for (const [name, version] of Object.entries(versions)) {
    const records = await workspace.storage.read(name, version)
    const environments =
      name === "@example/host" ? ["main", "service", "server"] : ["main", "server"]
    expect(records.map(({env}) => String(env)).sort(), `Сохранены все окружения ${name}`).toEqual(
      environments.slice().sort(),
    )
    for (const record of records) {
      const declared =
        name === "@example/view" && record.env === "main" ? [".", "./editor", "./theme.css"] : ["."]
      for (const key of declared) {
        expect(
          record.outputs.some(({artifact}) => artifact === key),
          `Публичный вход ${name}:${record.env}:${key} не потерян`,
        ).toBe(true)
      }
      for (const output of record.outputs) {
        const actual = await fileProof(output.path)
        expect(
          {sha256: actual.sha256, size: actual.size},
          `Результат ${output.artifact} подтверждён фактическими байтами`,
        ).toEqual({sha256: output.sha256, size: output.size})
        artifacts.push(output)
      }
    }
  }
  return artifacts
}
export async function expectSnapshotArtifacts(workspace: Workspace) {
  for (const artifact of [
    ...workspace.snapshot.published,
    ...workspace.snapshot.prepared,
    ...(workspace.snapshot.storageCopies ?? []),
  ]) {
    const record = (await workspace.storage.read(artifact.name, artifact.version)).find(
      ({env}) => env === artifact.env,
    )!
    const path = await resolveVersionedPackageArtifactPath(
      record.owner,
      artifact.version,
      artifact.artifact,
    )
    expect(
      path,
      `Сохранён адрес ${artifact.name}:${artifact.env}:${artifact.artifact}@${artifact.version}`,
    ).not.toBeNull()
    expect(await Bun.file(path!).text(), "Адрес возвращает исходные подтверждённые bytes").toBe(
      artifact.bytes,
    )
    const actual = await fileProof(path!)
    expect(
      {sha256: actual.sha256, size: actual.size},
      "Размер и хеш прежней identity сохранены",
    ).toEqual({sha256: artifact.sha256, size: artifact.size})
  }
}

/** Любая попытка публикации обратиться к browser/network runtime делает проверку ошибочной. */
export function runtimeBoundary() {
  const effects: string[] = []
  const restore: Array<() => void> = []
  for (const key of ["fetch", "WebSocket", "caches"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get() {
        effects.push(key)
        throw new Error(`Release crossed runtime boundary: ${key}`)
      },
    })
    restore.push(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
  return {effects, restore: () => restore.forEach((operation) => operation())}
}

export function expectPublicationOrder(
  workspace: Workspace,
  versions: Record<string, string>,
  paths: string[],
) {
  const rootPath = join(workspace.root, "package.json")
  const rootWrite = workspace.ioEvents.findIndex(
    ({operation, path}) => operation === "rename" && path === rootPath,
  )
  const firstBuild = workspace.ioEvents.findIndex(({operation}) => operation === "build")
  if (workspace.snapshot.request?.packages && firstBuild >= 0)
    expect(rootWrite, "Цель сохраняется перед запуском compiler").toBeLessThan(firstBuild)
  for (const observed of workspace.buildSnapshots) {
    const manifest = observed.root as {dependencies: Record<string, string>}
    expect(manifest.dependencies, "Сборка видит целиком назначенный состав").toEqual(
      Object.fromEntries(
        Object.entries(versions).map(([name, version]) => [name, `workspace:^${version}`]),
      ),
    )
    const children = Object.fromEntries(
      Object.entries(observed.children).map(([name, manifest]) => [
        name,
        (manifest as {version: string}).version,
      ]),
    )
    expect(children, "Child versions ещё не подтверждены во время подготовки").toEqual(
      workspace.snapshot.childVersions,
    )
  }
  const lastArtifact = Math.max(
    -1,
    ...workspace.ioEvents.map(({operation, path}, index) =>
      operation === "rename" && paths.includes(path) ? index : -1,
    ),
  )
  for (const [index, event] of workspace.ioEvents.entries()) {
    if (
      event.operation === "rename" &&
      event.path !== rootPath &&
      event.path.endsWith("/package.json")
    ) {
      expect(
        index,
        "Child manifest записывается после всех выходных файлов группы",
      ).toBeGreaterThan(lastArtifact)
    }
  }
}
