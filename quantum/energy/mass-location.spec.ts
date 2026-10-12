import {expect, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {BoundaryInitialProjection} from "shared/protocol/boundary/initial"
import {locateDirectoryMass} from "./mass-location"
import {parseMetaAddress} from "@metafor/types/metafor/graph"

test("private location resolves one canonical declaration without creating or acquiring and rejects ambiguity/unsafe paths", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "mass-location-")))
  const massRoot = join(root, "mass")
  const keyId = crypto.randomUUID()
  const directory = join(massRoot, `${keyId}.dir`)
  const envelope = (id: number, wimp: string, parentAtom: number | null, mass: unknown[]) => ({part: "graviton", op: "add", path: `atom/${id}`,
    value: {atom: {id, wimp, parentAtom, parentTopology: null, position: 0}, values: [], valueRecords: [], state: {}, mass},
  } as BoundaryInitialProjection["entries"][number])
  const declaration = {id: 9, key: "configuration", keyId, format: "directory", label: null, description: null}
  const projection: BoundaryInitialProjection = {version: 1, entries: [envelope(1, "@fixture/root", null, []), envelope(17, "@internal/peer", 1, [declaration])]}
  const input = {massRoot, projection, atom: {root: parseMetaAddress("@fixture/root")!, meta: parseMetaAddress("@internal/peer")!, ref: "atom:17" as const}, key: "configuration"}
  try {
    await expect(locateDirectoryMass(input)).rejects.toThrow()
    expect(await Bun.file(directory).exists()).toBeFalse()
    await mkdir(directory, {recursive: true})
    expect(await locateDirectoryMass(input)).toEqual({directory})
    await expect(locateDirectoryMass({...input, atom: {...input.atom, meta: parseMetaAddress("@fixture/wrong")!}})).rejects.toThrow("locator")
    await expect(locateDirectoryMass({...input, key: "missing"})).rejects.toThrow("key")
    await expect(locateDirectoryMass({...input, projection: {...projection, entries: [...projection.entries, projection.entries[1]!]}})).rejects.toThrow("ambiguous")
    await expect(locateDirectoryMass({...input, projection: {...projection, entries: [projection.entries[0]!, envelope(17, "@internal/peer", 1, [declaration, declaration])]}})).rejects.toThrow("ambiguous")
    await expect(locateDirectoryMass({...input, projection: {...projection, entries: [...projection.entries, envelope(2, "@fixture/root", null, [])]}})).rejects.toThrow("root")
    for (const change of [{format: "binary"}, {keyId: "../escape"}]) {
      await expect(locateDirectoryMass({...input, projection: {...projection, entries: [projection.entries[0]!, envelope(17, "@internal/peer", 1, [{...declaration, ...change}])]}})).rejects.toThrow()
    }
    await rm(directory, {recursive: true})
    await mkdir(join(root, "outside"))
    await symlink(join(root, "outside"), directory)
    await expect(locateDirectoryMass(input)).rejects.toThrow("real directories")
    await rm(directory)
    await rm(massRoot, {recursive: true})
    await symlink(join(root, "outside"), massRoot)
    await expect(locateDirectoryMass(input)).rejects.toThrow("real directories")
  } finally {await rm(root, {recursive: true, force: true})}
})
