import {createHash, randomUUID} from "node:crypto"
import {chmod, copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile} from "node:fs/promises"
import {dirname, isAbsolute, join, relative, resolve} from "node:path"
import {validateOperatorInstance, type OperatorInstance} from "./operator-instance"

const scripts = ["metafor-command.sh", "metafor-dev.sh", "managed-parent.sh", "inspector.sh", "terminal-runner.sh", "operator-mode.sh"]
const helpers = ["release-selection.ts", "installed-release.ts", "chrome-target.ts", "package-sizes.ts"]
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

interface OperatorReceipt {
  readonly version: 1
  readonly root: string
  readonly instance: string
  readonly instanceSha256: string
}

/** Собирает малую immutable operator-поставку; не меняет bin и не трогает процессы. */
export async function prepareOperator(options: {
  destination: string
  checkout: string
  environment: Readonly<Record<string, string>>
  port: number
  bunExecutable?: string
}): Promise<OperatorReceipt & {receipt: string}> {
  const checkout = await realpath(options.checkout)
  const source = resolve(import.meta.dir, "../../../..")
  const destination = resolve(options.destination)
  await mkdir(destination, {recursive: true, mode: 0o700})
  const actualDestination = await realpath(destination)
  for (const authoring of [checkout, source]) {
    const local = relative(authoring, actualDestination)
    if (local === "" || local !== ".." && !local.startsWith("../")) throw new Error("Operator destination must be outside authoring checkout")
  }
  const instance: OperatorInstance = {version: 1, checkout, port: options.port,
    bunExecutable: await realpath(options.bunExecutable ?? process.execPath), environment: options.environment}
  validateOperatorInstance(instance)
  const development = instance.environment.COSMOS_DEVELOPMENT_CONFIG
  if (development) {
    // Читаем только назначенные roots, не переопределяя capabilities их владельца.
    const assignment = JSON.parse(await readFile(development, "utf8")) as {roots?: {directory: string, writable: boolean}[]}
    if (!Array.isArray(assignment.roots)) throw new Error("Development authoring roots are unavailable")
    for (const item of assignment.roots) {
      if (!item.writable) continue
      const root = await realpath(item.directory)
      const local = relative(root, actualDestination)
      if (local === "" || local !== ".." && !local.startsWith("../")) throw new Error("Operator destination overlaps a writable authoring root")
    }
  }
  const instanceBytes = JSON.stringify(instance, null, 2) + "\n"
  const instanceSha256 = hash(instanceBytes)
  const stage = join(actualDestination, `.prepare-${randomUUID()}`)
  await mkdir(join(stage, "scripts"), {recursive: true, mode: 0o700})
  try {
    for (const name of scripts) await copyFile(join(import.meta.dir, name), join(stage, "scripts", name))
    for (const name of [...helpers, "operator-launcher.ts"]) {
      const build = await Bun.build({entrypoints: [join(import.meta.dir, name)], target: "bun", conditions: ["cosmos:server", "internal:server"]})
      if (!build.success || build.outputs.length !== 1) throw new Error(`Operator bundle failed: ${name}\n${build.logs.map(String).join("\n")}`)
      await writeFile(join(stage, name === "operator-launcher.ts" ? "server.mjs" : `scripts/${name}`), new Uint8Array(await build.outputs[0]!.arrayBuffer()))
    }
    const launch = 'NODE_ENV=development "$METAFOR_OPERATOR_BUN" --no-env-file --config="$METAFOR_OPERATOR_ROOT/bunfig.toml" "$METAFOR_OPERATOR_ROOT/server.mjs"'
    await writeFile(join(stage, "package.json"), JSON.stringify({private: true, type: "module", scripts: {dev: launch, "dev:debug": launch}}) + "\n")
    await writeFile(join(stage, "bunfig.toml"), "# Frozen operator: no checkout preloads.\n")
    await writeFile(join(stage, "INSTANCE.sha256"), instanceSha256 + "\n")
    const names = ["package.json", "bunfig.toml", "server.mjs", "INSTANCE.sha256", ...scripts.map(name => `scripts/${name}`), ...helpers.map(name => `scripts/${name}`)].sort()
    const sums = (await Promise.all(names.map(async name => `${hash(await readFile(join(stage, name)))}  ${name}\n`))).join("")
    await writeFile(join(stage, "SHA256SUMS"), sums)
    const root = join(actualDestination, "artifacts", hash(sums))
    await mkdir(dirname(root), {recursive: true, mode: 0o700})
    if (await Bun.file(join(root, "SHA256SUMS")).exists()) {
      await verifySnapshot(root)
    } else {
      for (const name of [...names, "SHA256SUMS"]) await chmod(join(stage, name), name.endsWith(".sh") ? 0o500 : 0o400)
      await chmod(join(stage, "scripts"), 0o500)
      await rename(stage, root)
      await chmod(root, 0o500)
    }
    const privateRoot = join(actualDestination, "instances")
    await mkdir(privateRoot, {recursive: true, mode: 0o700})
    const instancePath = join(privateRoot, `${randomUUID()}.json`)
    await writeFile(instancePath, instanceBytes, {mode: 0o400, flag: "wx"})
    const result: OperatorReceipt = {version: 1, root, instance: instancePath, instanceSha256}
    const receipt = `${instancePath}.receipt.json`
    await writeFile(receipt, JSON.stringify(result, null, 2) + "\n", {mode: 0o600, flag: "wx"})
    return {...result, receipt}
  } finally {
    await chmod(stage, 0o700).catch(() => {})
    await chmod(join(stage, "scripts"), 0o700).catch(() => {})
    await rm(stage, {recursive: true, force: true})
  }
}

async function verifySnapshot(root: string): Promise<void> {
  if (!isAbsolute(root) || !/^[a-f0-9]{64}$/.test(root.split("/").at(-1)!)) throw new Error("Invalid operator snapshot")
  const sums = await readFile(join(root, "SHA256SUMS"), "utf8")
  if (hash(sums) !== root.split("/").at(-1)) throw new Error("Operator manifest changed")
  for (const line of sums.trim().split("\n")) {
    const match = /^([a-f0-9]{64})  ([\w./-]+)$/.exec(line)
    if (!match || match[2]!.includes("..") || isAbsolute(match[2]!)) throw new Error("Invalid operator manifest entry")
    const file = join(root, match[2]!)
    const status = await lstat(file)
    if (!status.isFile() || status.isSymbolicLink() || hash(await readFile(file)) !== match[1]) throw new Error("Operator snapshot changed")
  }
}

/** Отдельный явный install переключает только entrypoint; runtime остаётся прежним. */
export async function installOperator(receiptPath: string, binPath: string): Promise<void> {
  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as OperatorReceipt
  if (receipt.version !== 1 || !isAbsolute(receipt.instance)) throw new Error("Invalid operator receipt")
  await verifySnapshot(receipt.root)
  const bytes = await readFile(receipt.instance)
  const instance = JSON.parse(bytes.toString()) as OperatorInstance
  validateOperatorInstance(instance)
  const status = await lstat(receipt.instance)
  if (!status.isFile() || status.isSymbolicLink() || status.uid !== process.getuid?.() || (status.mode & 0o077) || hash(bytes) !== receipt.instanceSha256)
    throw new Error("Operator instance binding changed")
  if ((await readFile(join(receipt.root, "INSTANCE.sha256"), "utf8")).trim() !== receipt.instanceSha256)
    throw new Error("Operator snapshot belongs to another instance")
  const bin = resolve(binPath)
  await mkdir(dirname(bin), {recursive: true})
  const temporary = `${bin}.${randomUUID()}.tmp`
  const content = `#!/bin/bash\nset -euo pipefail\nexport PATH=/opt/local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin\nunset BUN_OPTIONS NODE_OPTIONS BUN_CONFIG_PRELOAD COSMOS_RELEASE_SELECTION METAFOR_DEV_RELEASE_SELECTION\nexport METAFOR_OPERATOR_ROOT=${quote(receipt.root)}\nexport METAFOR_OPERATOR_INSTANCE=${quote(receipt.instance)}\nexport METAFOR_OPERATOR_INSTANCE_SHA256=${quote(receipt.instanceSha256)}\nexport METAFOR_OPERATOR_BUN=${quote(instance.bunExecutable)}\nexec /bin/bash ${quote(join(receipt.root, "scripts/metafor-command.sh"))} "$@"\n`
  try {await writeFile(temporary, content, {mode: 0o700, flag: "wx"}); await rename(temporary, bin)}
  finally {await rm(temporary, {force: true})}
}

if (import.meta.main) {
  try {
    const [action, first, second] = process.argv.slice(2)
    if (action === "prepare" && first && second) {
      const instance = JSON.parse(await readFile(second, "utf8")) as OperatorInstance
      validateOperatorInstance(instance)
      console.log(JSON.stringify(await prepareOperator({destination: first, ...instance})))
    } else if (action === "install" && first && second) {
      await installOperator(first, second)
      console.log("MetaFor operator entry installed; running contour unchanged")
    } else throw new Error("Usage: operator-install.ts prepare <outside-directory> <private-instance.json> | install <receipt.json> <bin-path>")
  } catch (error) {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1}
}
