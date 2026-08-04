import {
  generateGitignoreFile,
  generateIndexHtmlFile,
  generateMetaFile,
  generateMetaforTypesFile,
  generatePackageJsonFile,
  generateTodoFile,
  generateTsconfigFile,
  npmPackageName,
  type MetaIdentity,
  type MetaTemplateProfile,
} from "./generators.ts"

export interface MetaPackageTemplateOptions {
  identity: MetaIdentity
  name: string
  description: string
  author: string
  errorLabel: string
  htmlLang: string
  profile: MetaTemplateProfile
}

export interface MetaPackageFile {
  readonly path: string
  readonly source: string
}

export interface MetaPackageTemplate {
  readonly identity: MetaIdentity
  readonly source: string
  readonly profile: MetaTemplateProfile
  readonly files: readonly MetaPackageFile[]
}

export class MetaPackageTemplateError extends Error {
  override readonly name = "MetaPackageTemplateError"
}

const IDENTITY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const REQUIRED_FILES = [
  ".gitignore",
  "TODO.md",
  "index.html",
  "meta.ts",
  "package.json",
  "src/metafor.d.ts",
  "tsconfig.json",
] as const

const validateIdentity = (identity: MetaIdentity): void => {
  if (!IDENTITY_SEGMENT.test(identity.owner) || !IDENTITY_SEGMENT.test(identity.repository)) {
    throw new MetaPackageTemplateError("Meta identity must contain canonical owner and repository segments")
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const validateMetaPackageTemplate = (
  template: MetaPackageTemplate,
): MetaPackageTemplate => {
  validateIdentity(template.identity)
  if (template.source !== `${template.identity.owner}/${template.identity.repository}`) {
    throw new MetaPackageTemplateError("Meta package source does not match its identity")
  }
  if (template.profile !== "standard" && template.profile !== "empty") {
    throw new MetaPackageTemplateError("Meta package template profile is unsupported")
  }
  const paths = template.files.map(({path}) => path)
  if (new Set(paths).size !== paths.length || paths.some((path) => path.startsWith("/") || path.includes(".."))) {
    throw new MetaPackageTemplateError("Meta package template paths must be unique safe relative paths")
  }
  const sorted = [...paths].sort()
  if (JSON.stringify(sorted) !== JSON.stringify(REQUIRED_FILES)) {
    throw new MetaPackageTemplateError("Meta package template must contain the exact complete file set")
  }
  if (template.files.some(({source}) => typeof source !== "string" || source.length === 0)) {
    throw new MetaPackageTemplateError("Meta package template files must contain source")
  }
  const file = (path: string): string => template.files.find((candidate) => candidate.path === path)!.source
  let packageJson: Record<string, unknown>
  let tsconfig: Record<string, unknown>
  try {
    packageJson = JSON.parse(file("package.json")) as Record<string, unknown>
    tsconfig = JSON.parse(file("tsconfig.json")) as Record<string, unknown>
  } catch (error) {
    throw new MetaPackageTemplateError("Meta package JSON files must parse", {cause: error})
  }
  if (
    packageJson.name !== npmPackageName(template.identity) ||
    !isRecord(packageJson.exports) ||
    packageJson.exports["."] !== "./meta.ts"
  ) {
    throw new MetaPackageTemplateError("Meta package manifest does not match its identity")
  }
  if (!isRecord(tsconfig.compilerOptions)) {
    throw new MetaPackageTemplateError("Meta package tsconfig must declare compilerOptions")
  }
  if (!file("index.html").includes(`src="${template.source}"`)) {
    throw new MetaPackageTemplateError("Meta package index does not reference its canonical source")
  }
  const meta = file("meta.ts")
  if (template.profile === "empty" && !meta.includes(".fields((field) => ({}))")) {
    throw new MetaPackageTemplateError("Empty Meta package profile must not declare Fields")
  }
  return template
}

export const buildMetaPackageTemplate = (
  options: MetaPackageTemplateOptions,
): MetaPackageTemplate => {
  validateIdentity(options.identity)
  const source = `${options.identity.owner}/${options.identity.repository}`
  const files: MetaPackageFile[] = [
    {path: "meta.ts", source: generateMetaFile(options.name, options.description, options.errorLabel, options.profile)},
    {path: "src/metafor.d.ts", source: generateMetaforTypesFile()},
    {path: "package.json", source: generatePackageJsonFile(options.identity, options.description, options.author)},
    {path: "tsconfig.json", source: generateTsconfigFile()},
    {path: "TODO.md", source: generateTodoFile(options.name, options.description)},
    {path: ".gitignore", source: generateGitignoreFile()},
    {path: "index.html", source: generateIndexHtmlFile(options.name, options.description, options.htmlLang, source)},
  ]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => Object.freeze(file))
  return validateMetaPackageTemplate(Object.freeze({
    identity: Object.freeze({...options.identity}),
    source,
    profile: options.profile,
    files: Object.freeze(files),
  }))
}
