import "@metafor/dsl"
import {pathToFileURL} from "node:url"
import {readFile, realpath} from "node:fs/promises"
import {resolve} from "node:path"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {defaultMetaSourceResolver, type MetaSourceResolver} from "shared/metafor/source"
export {canonicalMetaSource} from "shared/metafor/source"

/** Dark разрешает canonical src через выбранный source либо installed adapter. */
export const resolveMetaPath = (address: string, resolver: MetaSourceResolver = defaultMetaSourceResolver()): string =>
  resolver.resolveMetaPath(address)

/** Authoring требует source preparation; установленный код остаётся read-only. */
export const resolveMetaAuthoringPath = (address: string, resolver: MetaSourceResolver = defaultMetaSourceResolver()): string => {
  if (resolver.installed) throw new Error("Meta authoring requires a source preparation root")
  return resolver.resolveMetaPath(address)
}

const transpiler = new Bun.Transpiler({loader: "tsx", target: "bun", autoImportJSX: true,
  tsconfig: JSON.stringify({compilerOptions: {jsx: "react-jsx", jsxImportSource: "@metafor/dsl"}}),
})

export interface EvaluateMetaSourceOptions {
  /** Exact original owner file; static declaration imports resolve beside it. */
  readonly sourcePath?: string
}

/**
Evaluates original declaration bytes once as a fresh module. Source-bound
preparation bundles static declaration imports, preserving dynamic action import
specifiers as inert serialized wrappers. DSL and JSX runtime stay external and
share one declaration identity. No output file or source mutation is created.
Installed loading bypasses this evaluator entirely. [Tests](./load.spec.ts).
*/
export const evaluateMetaSource = async (source: string, options: EvaluateMetaSourceOptions = {}): Promise<MetaDSL> => {
  let javascript: string
  if (options.sourcePath === undefined) javascript = transpiler.transformSync(source)
  else {
    const sourcePath = await realpath(resolve(options.sourcePath))
    const build = await Bun.build({
      entrypoints: [sourcePath],
      target: "bun",
      external: ["@metafor/dsl", "@metafor/dsl/*"],
      plugins: [{name: "metafor-source-declaration", setup(builder) {
        // Actions execute later from the prepared public graph. Compiling their
        // imports here would rewrite the callbacks before DSL serialization.
        builder.onResolve({filter: /.*/}, args => args.kind === "dynamic-import" ? {path: args.path, external: true} : undefined)
        builder.onLoad({filter: /\.[cm]?[jt]sx?$/}, async args => {
          const contents = resolve(args.path) === sourcePath ? source : await readFile(args.path, "utf8")
          const pragma = /@jsxImportSource\s+(\S+)/.exec(contents)?.[1]
          if (pragma !== undefined && pragma !== "@metafor/dsl") throw new Error("Meta declaration JSX must use @metafor/dsl")
          return {contents: `/** @jsxImportSource @metafor/dsl */\n${contents}`, loader: /\.[jt]sx$/.test(args.path) ? "tsx" : "ts"}
        })
      }}],
    })
    if (!build.success || build.outputs.length !== 1) throw new Error(`Meta declaration compilation failed: ${build.logs.map(String).join("\n")}`)
    javascript = await build.outputs[0]!.text()
  }
  const moduleUrl = URL.createObjectURL(new Blob([javascript], {type: "text/javascript"}))
  try {
    const module = await import(moduleUrl)
    return (module.default ?? module) as MetaDSL
  } finally {
    URL.revokeObjectURL(moduleUrl)
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
Dark читает декларацию из выбранного [источника Meta](../../docs/META_PACKAGES.md).
Source mode повторно оценивает текущие bytes; installed mode импортирует exact
entry file URL, сохраняя относительные compiled chunks и module cache immutable
артефакта. Проверку принадлежности и bytes installed mapping выполняет storage
owner до передачи adapter. Missing entry отклоняется без source fallback.
Проверки обоих режимов: [load](./load.spec.ts).
*/
export const loadMeta = async (address: string, resolver?: MetaSourceResolver): Promise<MetaDSL> => {
  const selected = resolver ?? defaultMetaSourceResolver()
  const sourcePath = resolveMetaPath(address, selected)
  try {
    if (selected.installed) {
      const module = await import(pathToFileURL(sourcePath).href)
      return (module.default ?? module) as MetaDSL
    }
    return await evaluateMetaSource(await readFile(sourcePath, "utf8"), {sourcePath})
  } catch (error) {
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(error)}`)
  }
}
