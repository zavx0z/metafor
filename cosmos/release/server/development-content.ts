import {createHash} from "node:crypto"
import {lstat} from "node:fs/promises"
import {dirname, join, relative, sep} from "node:path"
import readIndex from "@zavx0z/storybook-package-index"
import readDocumentation from "@zavx0z/storybook-package-documentation"
import type {createDevelopmentCatalog} from "./development-catalog"
import {createDevelopmentSources} from "./development-source"
import {DEVELOPMENT_PATH, type DevelopmentContent} from "../shared/development"

type Catalog = Pick<Awaited<ReturnType<typeof createDevelopmentCatalog>>, "source" | "contentNode" | "snapshot">

/** Содержание реального public node: TSDoc и исходники контрактов; сценарии требуют отдельной prepared owner revision. */
export function createDevelopmentContent(catalog: Catalog) {
  const files = createDevelopmentSources(catalog)
  return async (packageName: string, nodeId?: string): Promise<DevelopmentContent> => {
    const {source, node, metadata, manifest} = catalog.contentNode(packageName, nodeId)
    const local = (path: string) => {
      const value = relative(source.directory, path).split(sep).join("/")
      if (value === ".." || value.startsWith("../")) throw new Error("Content source escapes its assigned package")
      return value
    }
    const index = await readIndex({path: source.directory, exports: manifest.exports})
    const entries = index.entries.map(({path, target, conditions, status, input, output}) => ({path, target, conditions, status, input, output}))
    const base = node.kind === "directory" ? node.sourcePath : node.kind === "entry" ? dirname(node.sourcePath) : "."
    const candidates = new Set(index.entries.filter(entry => entry.status === "owned" && (node.kind === "package" || entry.target === `./${node.sourcePath}`))
      .flatMap(entry => [entry.input, entry.output].filter((path): path is string => path !== null)))
    const contractRoot = join(source.directory, base, "contract")
    // Отдельный package сохраняет своё владение даже внутри contract-директории.
    if (!await lstat(join(contractRoot, "package.json")).catch(error => {if (error.code === "ENOENT") return null; throw error})) {
      for (const name of ["index.ts", "input.ts", "output.ts"]) candidates.add(join(base, "contract", name))
    }
    const contracts: DevelopmentContent["contracts"][number][] = []
    for (const path of candidates) {
      const info = await lstat(join(source.directory, path)).catch(error => {if (error.code === "ENOENT") return null; throw error})
      if (!info) continue
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Contract source is not an owned regular file")
      const file = await files.read(packageName, path)
      contracts.push({path: file.path, content: file.content, hash: file.hash})
    }
    const documentationSource = metadata.moduleDocumentation ? local(metadata.moduleDocumentation.sourcePath) : null
    const documentation = documentationSource === null ? null : readDocumentation({path: documentationSource,
      source: (await files.read(packageName, documentationSource)).content})
    const mediaDirectory = documentation ? dirname(documentation.sourcePath) : base
    const resourceBase = `${DEVELOPMENT_PATH}/resource/${encodeURIComponent(packageName)}/${mediaDirectory === "." ? "" : mediaDirectory.split("/").map(encodeURIComponent).join("/") + "/"}`
    const value = {packageName, node, resourceBase, overview: {label: source.label, ...(manifest.description ? {description: manifest.description} : {})},
      documentation, entries, contracts, dependencies: catalog.snapshot.dependencies.filter(edge => edge.from === packageName)
        .map(edge => ({name: edge.to, kind: edge.kind, range: edge.range})),
      scenarios: {sourcePaths: metadata.scenarioSpec?.sourcePaths.map(local) ?? [], executable: false as const,
        reason: "Для исполнения сценария нужна подготовленная ревизия его владельца; чтение исходников её не создаёт"}}
    return {...value, revision: createHash("sha256").update(JSON.stringify(value)).digest("hex")}
  }
}
