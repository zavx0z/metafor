import {expect, test} from "bun:test"
import {MetaFor} from "../../index"
import type {InferMetaMass} from "@metafor/types/metafor/schema"
import type {MassDirectoryHandle, MassDirectoryLease, MassHandle} from "@metafor/types/metafor/mass"

const meta = MetaFor("directory-types")
  .fields(() => ({}))
  .superposition({ready: null})
  .mass(mass => ({workspace: mass.directory(), stats: mass.json(), bytes: mass.binary()}))
  .energy()
  .processes()
  .reactions()
  .matter()
  .bulk()

type Handles = InferMetaMass<typeof meta>
const contract = async (mass: Handles) => {
  const directory: MassDirectoryHandle = mass.workspace
  const json: MassHandle = mass.stats
  const binary: MassHandle = mass.bytes
  const lease: MassDirectoryLease = await directory.acquire()
  const path: string = lease.path
  const signal: AbortSignal = lease.signal
  await lease.release()
  // @ts-expect-error Directory does not offer byte reads
  mass.workspace.readBytes()
  // @ts-expect-error File handles do not expose local directory paths
  mass.stats.acquire()
  // @ts-expect-error Directory keys cannot be mistaken for file codec handles
  const wrong: MassHandle = mass.workspace
  // @ts-expect-error Inferred Mass contains only declared keys
  mass.missing
  void [json, binary, path, signal, wrong]
}

test("directory declaration retains literal format and generates distinct handle contract", () => {
  expect(meta.mass).toEqual([{key: "workspace", format: "directory"}, {key: "stats", format: "json"}, {key: "bytes", format: "binary"}])
  expect(typeof contract).toBe("function")
})
