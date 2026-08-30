import {extname} from "node:path"
import {rootPackageArtifact, type PackageExportSubpath} from "../../shared/artifact"
import type {PackageBuildSource} from "../shared/contracts"

const scriptExtensions = new Set([
  ".cjs",
  ".cjsx",
  ".cts",
  ".ctsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mjsx",
  ".mts",
  ".mtsx",
  ".ts",
  ".tsx",
])

export type PackageBuildSourceKind = "script" | "style" | "copy"

/**
Классифицирует exact exports source по операции, сохраняющей public bytes и
module semantics.

JavaScript-family source и CSS становятся Bun entrypoints. WebAssembly и
остальные extensions остаются raw copies; extension не выбирает environment.
*/
export function packageBuildSourceKind(source: string): PackageBuildSourceKind {
  if (/\.d\.(?:cts|mts|ts)$/i.test(source)) return "copy"
  const extension = extname(source).toLowerCase()
  if (scriptExtensions.has(extension)) return "script"
  if (extension === ".css") return "style"
  return "copy"
}

/** Возвращает deterministic Bun entrypoint subset одного environment graph. */
export function packageBuildEntrypoints(sources: readonly PackageBuildSource[]) {
  return sources.filter(({source}) => packageBuildSourceKind(source) !== "copy")
}

/**
Возвращает immutable public file suffix одного semantic export.

Source kind определяет итоговый extension, поэтому `./foo` и `./foo.js` могут
обозначать один physical path и обязаны быть отклонены до build.
*/
export function packagePublicArtifactOutput(
  artifact: PackageExportSubpath,
  source: string,
) {
  const sourceExtension = extname(source)
  const kind = packageBuildSourceKind(source)
  const outputExtension = kind === "script" ? ".js" : kind === "style" ? ".css" : sourceExtension
  const publicPath = artifact.slice(2)
  const publicExtension = extname(publicPath)
  return publicExtension === ""
    ? `${publicPath}${outputExtension}`
    : `${publicPath.slice(0, -publicExtension.length)}${outputExtension}`
}

/** Отклоняет semantic public keys, нормализующиеся в один physical output. */
export function validatePackageBuildSourceOutputs(
  environment: string,
  sources: readonly PackageBuildSource[],
) {
  const outputs = new Map<string, PackageExportSubpath>()
  for (const {artifact, source} of sources) {
    if (artifact === rootPackageArtifact) continue
    const output = packagePublicArtifactOutput(artifact, source)
    const previous = outputs.get(output)
    if (previous !== undefined)
      throw new Error(`${environment} public artifacts ${previous} and ${artifact} share output ${output}`)
    outputs.set(output, artifact)
  }
}
