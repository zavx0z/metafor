import {constants} from "node:fs"
import {open, rename, rm} from "node:fs/promises"
import {join} from "node:path"
import {parseMetaAddress, type AtomRef} from "@metafor/types/metafor/graph"
import type {MassDirectoryLease} from "@metafor/types/metafor/mass"
import type {OraclePeerWorld, OracleWorldIdentity} from "@metafor/types/metafor/peer-oracle"

type Pins = {schema: "metafor/peer-world-pins/v1", version: 1, localWorld: OracleWorldIdentity, localAtomRefs: AtomRef[], worlds: Record<string, {world: OraclePeerWorld["worldIdentity"], role: "leader" | "follower", atomRefs: AtomRef[]}>}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join(",") === expected.sort().join(",")
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)

/**
 * Persistent security assignment in the native peer's own directory Mass, not
 * a second Provider registry. First admitted scope is persisted before readiness;
 * another cut or Atom grant cannot silently replace it after cold Energy birth.
 * [Owner law](../../docs/domains/ENERGY.md#доступ-process-к-oracle-environment).
 * [Cold restoration tests](./peer-oracle.spec.ts) prove retained-world refusal.
 */
export async function openPeerWorldPins(lease: MassDirectoryLease, localWorld: OracleWorldIdentity, localAtomRefs: AtomRef[]) {
  lease.signal.throwIfAborted()
  const path = join(lease.path, "oracle-world-pins.json")
  let pins: Pins = {schema: "metafor/peer-world-pins/v1", version: 1, localWorld, localAtomRefs, worlds: {}}
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 256 * 1024 || (stat.mode & 0o077) !== 0 || typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("Invalid peer world scope pins")
    const value: unknown = JSON.parse(await file.readFile("utf8"))
    if (!object(value) || !keys(value, ["schema", "version", "localWorld", "localAtomRefs", "worlds"]) || value.schema !== pins.schema || value.version !== 1 || !object(value.worlds) || Object.keys(value.worlds).length > 32 ||
        !object(value.localWorld) || !keys(value.localWorld, ["peerId", "root", "cutId"]) || value.localWorld.peerId !== localWorld.peerId || value.localWorld.root !== localWorld.root || value.localWorld.cutId !== localWorld.cutId ||
        !Array.isArray(value.localAtomRefs) || value.localAtomRefs.length > 64 || !value.localAtomRefs.every(ref => typeof ref === "string" && /^atom:[1-9][0-9]*$/.test(ref))) throw new Error("Local world or Atom scope changed; explicit owner binding is required")
    const retainedLocalRefs = value.localAtomRefs
    if (localAtomRefs.some(ref => !retainedLocalRefs.includes(ref))) throw new Error("Local world or Atom scope changed; explicit owner binding is required")
    for (const [peer, pin] of Object.entries(value.worlds)) {
      if (!id(peer) || !object(pin) || !keys(pin, ["world", "role", "atomRefs"]) || !object(pin.world) || !keys(pin.world, ["peerId", "root", "cutId"]) || pin.world.peerId !== peer ||
          typeof pin.world.root !== "string" || !parseMetaAddress(pin.world.root) || !id(pin.world.cutId) || !["leader", "follower"].includes(String(pin.role)) ||
          !Array.isArray(pin.atomRefs) || pin.atomRefs.length > 64 || !pin.atomRefs.every(ref => typeof ref === "string" && /^atom:[1-9][0-9]*$/.test(ref)) || new Set(pin.atomRefs).size !== pin.atomRefs.length) throw new Error("Invalid peer world scope pins")
    }
    pins = value as unknown as Pins
  } catch (error) {
    if (!object(error) || error.code !== "ENOENT") throw error
  } finally {await file?.close()}
  let writing = Promise.resolve()
  return {localRefs: [...pins.localAtomRefs], bind(world: OraclePeerWorld, refs: AtomRef[]): Promise<AtomRef[]> {
    let result: AtomRef[] = []
    const work = writing.then(async () => {
      lease.signal.throwIfAborted()
      const previous = pins.worlds[world.peerId]
      if (previous) {
        if (previous.world.peerId !== world.worldIdentity.peerId || previous.world.root !== world.worldIdentity.root || previous.world.cutId !== world.worldIdentity.cutId || previous.role !== world.role || refs.some(ref => !previous.atomRefs.includes(ref))) {
          throw new Error("Peer world or Atom scope changed; explicit owner binding is required")
        }
        result = [...previous.atomRefs]
        return
      }
      if (Object.keys(pins.worlds).length >= 32 || refs.length === 0 || refs.length > 64) throw new Error("Peer Provider Atom scope is unavailable")
      const next: Pins = structuredClone(pins)
      next.worlds[world.peerId] = {world: structuredClone(world.worldIdentity), role: world.role, atomRefs: [...new Set(refs)]}
      const temporary = join(lease.path, `.oracle-world-pins.${crypto.randomUUID()}.tmp`)
      let output: Awaited<ReturnType<typeof open>> | undefined
      try {
        output = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
        await output.writeFile(JSON.stringify(next))
        await output.sync()
        await output.close()
        output = undefined
        lease.signal.throwIfAborted()
        await rename(temporary, path)
        const directory = await open(lease.path, constants.O_RDONLY)
        try {await directory.sync()} finally {await directory.close()}
        pins = next
        result = [...next.worlds[world.peerId]!.atomRefs]
      } finally {await output?.close(); await rm(temporary, {force: true})}
    })
    writing = work.catch(() => {})
    return work.then(() => result)
  }}
}
