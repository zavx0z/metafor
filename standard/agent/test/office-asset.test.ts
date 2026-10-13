import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, type DOMComponentConstructor} from "@zavx0z/immersive"
import {createSpaceElementFactories, XRAssetElement} from "@zavx0z/immersive/space"
import {BoxGeometry, BufferAttribute, Matrix4, MeshLambertMaterial, Object3D, Skeleton, SkinnedMesh} from "@zavx0z/immersive/engine"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import {createOfficeInstances} from "../office-instances"
import {layoutAgentOffice} from "../office-layout"

test("compiled native Asset сохраняет shared instance batches при same-Document reparent без второго Canvas/Space", async () => {
  const owner = resolve(import.meta.dir, "..")
  const directory = await mkdtemp(join(owner, ".compiled-office-"))
  try {
    await symlink(join(owner, "node_modules"), join(directory, "node_modules"), "dir")
    const built = await Bun.build({entrypoints: [join(import.meta.dir, "fixture/office-asset.tsx")], outdir: directory, naming: "office-asset.js", target: "bun",
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({cwd: owner, sourceRoots: [owner], styleSourceRootIds: ["@metafor/agent"]})]})
    if (!built.success) throw new AggregateError(built.logs, "Office Asset fixture compilation failed")
    const OfficeAsset = (await import(pathToFileURL(join(directory, "office-asset.js")).href)).OfficeAsset as DOMComponentConstructor<{factory: () => Object3D}>
    const geometry = new BoxGeometry({width: 2, height: 2, depth: 2})
    const vertices = geometry.attributes.position!.count
    geometry.setAttribute("skinIndex", new BufferAttribute(new Uint16Array(vertices * 4), 4))
    const weights = new Float32Array(vertices * 4)
    for (let index = 0; index < vertices; index++) weights[index * 4] = 1
    geometry.setAttribute("skinWeight", new BufferAttribute(weights, 4))
    const pose = new SkinnedMesh(geometry, new MeshLambertMaterial(), new Skeleton([new Object3D()], [new Matrix4()]))
    const placement = (count: number) => layoutAgentOffice({roomBounds: {min: {x: -100, y: -100, z: 0}, max: {x: 100, y: 100, z: 100}},
      humanoid: {min: {x: -1, y: -1, z: -1}, max: {x: 1, y: 1, z: 1}}, agents: Array.from({length: count}, (_, index) => ({id: `agent-${index}`, displays: []}))})
    const instances = createOfficeInstances({layout: placement(2), avatars: [{mesh: pose, transform: new Matrix4()}], avatarCapacity: 4})
    const document = createDocument({elementFactories: createSpaceElementFactories()})
    const space = document.createElement("space"), first = document.createElement("xr-group"), second = document.createElement("xr-group")
    document.append(space)
    space.append(first, second)
    const root = createDomRoot(first)
    try {
      root.render(OfficeAsset, {factory: instances.object})
      root.flush()
      const asset = document.querySelector("xr-asset")
      if (!(asset instanceof XRAssetElement)) throw new Error("Native Asset is missing")
      expect(asset.factory).toBe(instances.object)
      expect(instances.object().children).toHaveLength(1)
      expect(instances.avatarBatches[0]?.count).toBe(2)
      root.moveTo(second)
      instances.update(placement(3))
      root.render(OfficeAsset, {factory: instances.object})
      root.flush()
      expect(document.querySelector("xr-asset")).toBe(asset)
      expect(asset.parentElement).toBe(second)
      expect(asset.ownerDocument).toBe(document)
      expect(asset.factory).toBe(instances.object)
      expect(instances.avatarBatches[0]?.count).toBe(3)
      expect(document.querySelectorAll("space")).toHaveLength(1)
      expect(document.querySelectorAll("canvas")).toHaveLength(0)
    } finally {root.unmount(); instances.dispose()}
    expect(document.querySelector("xr-asset")).toBeNull()
    expect(pose.geometry.attributes.position).toBeDefined()
  } finally {await rm(directory, {recursive: true, force: true})}
}, 30000)
