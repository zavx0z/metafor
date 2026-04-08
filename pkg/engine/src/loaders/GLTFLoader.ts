import { Object3D } from "../core/Object3D"
import { Scene } from "../scenes/Scene"
import { Vector3 } from "../math/Vector3"
import { Mesh } from "../core/Mesh"
import { BufferAttribute, BufferGeometry, TypedArray } from "../core/BufferGeometry"
import { MeshLambertMaterial } from "../materials/MeshLambertMaterial"
import { Color } from "../math/Color"
import { SkinnedMesh } from "../core/SkinnedMesh"
import { Skeleton } from "../animation/Skeleton"
import { Matrix4 } from "../math/Matrix4"
import { AnimationClip } from "../animation/AnimationClip"
import { KeyframeTrack } from "../animation/KeyframeTrack"
import { Quaternion } from "../math/Quaternion"

// --- GLTF Constants ---
const GLB_MAGIC = 0x46546c67 // "glTF" в ASCII
const JSON_CHUNK_TYPE = 0x4e4f534a // "JSON" в ASCII
const BIN_CHUNK_TYPE = 0x004e4942 // "BIN\0" в ASCII

// --- GLTF SPECIFICATION INTERFACES ---
interface GLTF {
  scenes?: GLTFScene[]
  scene?: number
  nodes?: GLTFNode[]
  meshes?: GLTFMesh[]
  buffers?: GLTFBuffer[]
  bufferViews?: GLTFBufferView[]
  accessors?: GLTFAccessor[]
  materials?: GLTFMaterial[]
  skins?: GLTFSkin[]
  animations?: GLTFAnimation[]
}

interface GLTFScene {
  nodes: number[]
  name?: string
}

interface GLTFNode {
  name?: string
  mesh?: number
  skin?: number
  children?: number[]
  matrix?: number[]
  translation?: [number, number, number]
  rotation?: [number, number, number, number]
  scale?: [number, number, number]
}

interface GLTFMesh {
  primitives: GLTFPrimitive[]
  name?: string
}

interface GLTFPrimitive {
  attributes: { [key: string]: number }
  indices?: number
  material?: number
}

interface GLTFBuffer {
  uri?: string
  byteLength: number
}

interface GLTFBufferView {
  buffer: number
  byteOffset?: number
  byteLength: number
  target?: number
}

interface GLTFAccessor {
  bufferView?: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
  max?: number[]
  min?: number[]
}

interface GLTFMaterial {
  name?: string
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number]
  }
}

interface GLTFSkin {
  inverseBindMatrices?: number
  joints: number[]
  skeleton?: number
  name?: string
}

interface GLTFAnimation {
  name?: string
  channels: GLTFAnimationChannel[]
  samplers: GLTFAnimationSampler[]
}

interface GLTFAnimationChannel {
  sampler: number
  target: {
    node: number
    path: 'translation' | 'rotation' | 'scale'
  }
}

interface GLTFAnimationSampler {
  input: number // accessor to keyframe times
  interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE'
  output: number // accessor to keyframe values
}

interface GLTFLoaderOptions {
  convertToZUp?: boolean
}

interface ParsedGLTF {
  scene: Scene
  animations: AnimationClip[]
}

export class GLTFLoader {
  public async load(url: string, options?: GLTFLoaderOptions): Promise<ParsedGLTF> {
    const { convertToZUp = true } = options ?? {}
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength < 4) {
      throw new Error(`File is too short or empty: ${url}`)
    }

    let gltf: GLTF
    let buffers: ArrayBuffer[]
    const dataView = new DataView(arrayBuffer)

    if (dataView.getUint32(0, true) === GLB_MAGIC) {
      const glbResult = this.parseGLB(arrayBuffer)
      gltf = glbResult.gltf
      buffers = glbResult.buffers
    } else {
      const textDecoder = new TextDecoder('utf-8')
      gltf = JSON.parse(textDecoder.decode(arrayBuffer)) as GLTF
      const baseUri = url.substring(0, url.lastIndexOf('/') + 1)
      buffers = await this.loadExternalBuffers(gltf, baseUri)
    }

    const materials = this.parseMaterials(gltf)
    const animations = this.parseAnimations(gltf, buffers)

    const scene = new Scene()
    let parentNode: Object3D = scene

    if (convertToZUp) {
      const modelWrapper = new Object3D()
      modelWrapper.rotation.x = Math.PI / 2
      modelWrapper.updateMatrix()
      scene.add(modelWrapper)
      parentNode = modelWrapper
    }

    const nodes = await this.parseNodes(gltf, buffers, materials)
    const skeletons = await this.parseSkins(gltf, buffers, nodes)

    this.assignSkeletonsToMeshes(nodes, skeletons, gltf)

    if (gltf.scene !== undefined && gltf.scenes) {
      const sceneDef = gltf.scenes[gltf.scene]
      for (const nodeIndex of sceneDef.nodes) {
        const node = nodes[nodeIndex]
        if (node) {
          parentNode.add(node)
        }
      }
    }

    return { scene, animations }
  }

  private parseGLB(data: ArrayBuffer): { gltf: GLTF; buffers: ArrayBuffer[] } {
    const dataView = new DataView(data)
    const magic = dataView.getUint32(0, true)
    if (magic !== GLB_MAGIC) {
      throw new Error('Invalid GLB file: incorrect magic number.')
    }
    const version = dataView.getUint32(4, true)
    if (version !== 2) {
      throw new Error(`Unsupported GLB version: ${version}. Only version 2 is supported.`)
    }

    let jsonChunkData: ArrayBuffer | null = null
    let binChunkData: ArrayBuffer | null = null
    let chunkOffset = 12

    while (chunkOffset + 8 <= data.byteLength) {
      const chunkLength = dataView.getUint32(chunkOffset, true)
      const chunkType = dataView.getUint32(chunkOffset + 4, true)
      const chunkDataStart = chunkOffset + 8
      const chunkData = data.slice(chunkDataStart, chunkDataStart + chunkLength)

      if (chunkType === JSON_CHUNK_TYPE) {
        jsonChunkData = chunkData
      } else if (chunkType === BIN_CHUNK_TYPE) {
        binChunkData = chunkData
      }
      chunkOffset = chunkDataStart + chunkLength
    }

    if (!jsonChunkData) {
      throw new Error('Invalid GLB file: JSON chunk not found.')
    }

    const textDecoder = new TextDecoder('utf-8')
    const gltf = JSON.parse(textDecoder.decode(jsonChunkData)) as GLTF
    const buffers: ArrayBuffer[] = []
    if (binChunkData) {
      buffers.push(binChunkData)
    }

    return { gltf, buffers }
  }

  private async loadExternalBuffers(gltf: GLTF, baseUri: string): Promise<ArrayBuffer[]> {
    const promises: Promise<ArrayBuffer>[] = []
    if (gltf.buffers) {
      for (const bufferInfo of gltf.buffers) {
        if (!bufferInfo.uri) {
          throw new Error('Buffer URI is missing for external buffer.')
        }
        promises.push(
          fetch(baseUri + bufferInfo.uri)
            .then((res) => res.arrayBuffer())
            .then((arrayBuffer) => {
              if (arrayBuffer.byteLength < bufferInfo.byteLength) {
                throw new Error('glTF buffer length mismatch: loaded data is smaller than specified.')
              }
              return arrayBuffer
            })
        )
      }
    }
    return Promise.all(promises)
  }

  private parseMaterials(gltf: GLTF): MeshLambertMaterial[] {
    const materials: MeshLambertMaterial[] = []
    if (gltf.materials) {
      for (const mat of gltf.materials) {
        let color
        if (mat.pbrMetallicRoughness?.baseColorFactor) {
          const [r, g, b] = mat.pbrMetallicRoughness.baseColorFactor
          color = new Color(r, g, b)
        }
        materials.push(new MeshLambertMaterial({ color }))
      }
    }
    return materials
  }

  private async parseNodes(
    gltf: GLTF,
    buffers: ArrayBuffer[],
    materials: MeshLambertMaterial[]
  ): Promise<Object3D[]> {
    const nodes: Object3D[] = []
    if (!gltf.nodes) return []

    for (let i = 0; i < gltf.nodes.length; i++) {
      const nodeDef = gltf.nodes[i]
      const node = new Object3D()
      node.name = nodeDef.name || `node_${i}`

      if (nodeDef.matrix) {
        node.modelMatrix.elements.set(nodeDef.matrix)
        node.modelMatrix.decompose(node.position, node.quaternion, node.scale)
      } else {
        if (nodeDef.translation) {
          node.position.set(nodeDef.translation[0], nodeDef.translation[1], nodeDef.translation[2])
        }
        if (nodeDef.rotation) {
          node.quaternion.set(nodeDef.rotation[0], nodeDef.rotation[1], nodeDef.rotation[2], nodeDef.rotation[3])
        }
        if (nodeDef.scale) {
          node.scale.set(nodeDef.scale[0], nodeDef.scale[1], nodeDef.scale[2])
        }
        node.updateMatrix()
      }

      if (nodeDef.mesh !== undefined) {
        const meshDef = gltf.meshes![nodeDef.mesh]
        for (const primitive of meshDef.primitives) {
          const geometry = this.parseGeometry(gltf, primitive, buffers)
          const material = primitive.material !== undefined ? materials[primitive.material] : new MeshLambertMaterial()
          const mesh = new Mesh(geometry, material)
          mesh.name = meshDef.name || `mesh_${nodeDef.mesh}`
          node.add(mesh)
        }
      }
      nodes.push(node)
    }

    // Build hierarchy
    for (let i = 0; i < gltf.nodes.length; i++) {
      const nodeDef = gltf.nodes[i]
      const parent = nodes[i]
      if (nodeDef.children) {
        for (const childIndex of nodeDef.children) {
          const child = nodes[childIndex]
          if (parent && child) {
            parent.add(child)
          }
        }
      }
    }

    return nodes
  }

  private async parseSkins(gltf: GLTF, buffers: ArrayBuffer[], nodes: Object3D[]): Promise<Skeleton[]> {
    const skeletons: Skeleton[] = []
    if (!gltf.skins) return []

    for (const skinDef of gltf.skins) {
      const bones: Object3D[] = []
      for (const jointIndex of skinDef.joints) {
        bones.push(nodes[jointIndex])
      }

      let boneInverses: Matrix4[] = []
      if (skinDef.inverseBindMatrices !== undefined) {
        const accessor = gltf.accessors![skinDef.inverseBindMatrices]
        const data = this.getAccessorData(gltf, accessor, buffers) as Float32Array
        for (let i = 0; i < data.length; i += 16) {
          const matrix = new Matrix4()
          matrix.elements.set(data.subarray(i, i + 16))
          boneInverses.push(matrix)
        }
      }

      skeletons.push(new Skeleton(bones, boneInverses))
    }

    return skeletons
  }

  private assignSkeletonsToMeshes(nodes: Object3D[], skeletons: Skeleton[], gltf: GLTF): void {
    if (!gltf.nodes) return;

    for (let i = 0; i < gltf.nodes.length; i++) {
      const nodeDef = gltf.nodes[i]
      if (nodeDef.skin === undefined || nodeDef.mesh === undefined) continue;

      const node = nodes[i]
      const skeleton = skeletons[nodeDef.skin]
      if (!node || !skeleton) continue;

      node.traverse((child) => {
        if (child instanceof Mesh) {
            const parent = child.parent;
            if(parent) {
                const index = parent.children.indexOf(child);
                if(index !== -1) {
                    const skinnedMesh = new SkinnedMesh(child.geometry, child.material, skeleton);
                    skinnedMesh.name = child.name;
                    parent.children[index] = skinnedMesh;
                    skinnedMesh.parent = parent;
                }
            }
        }
      });
    }
  }

  private parseAnimations(gltf: GLTF, buffers: ArrayBuffer[]): AnimationClip[] {
    const animations: AnimationClip[] = []
    if (!gltf.animations) return []

    for (const animDef of gltf.animations) {
      const tracks: KeyframeTrack[] = []
      for (const channel of animDef.channels) {
        const sampler = animDef.samplers[channel.sampler]
        if (!sampler || sampler.interpolation !== 'LINEAR') continue

        const times = this.getAccessorData(gltf, gltf.accessors![sampler.input], buffers) as Float32Array
        let values = this.getAccessorData(gltf, gltf.accessors![sampler.output], buffers) as Float32Array

        const nodeIndex = channel.target.node
        const nodeName = gltf.nodes?.[nodeIndex]?.name || `node_${nodeIndex}`

        let trackType: 'vector' | 'quaternion' | 'scale' | undefined;
        if (channel.target.path === 'translation') trackType = 'vector';
        else if (channel.target.path === 'rotation') trackType = 'quaternion';
        else if (channel.target.path === 'scale') trackType = 'scale';

        if (trackType) {
          tracks.push(new KeyframeTrack(nodeName, trackType, times, values))
        }
      }
      animations.push(new AnimationClip(animDef.name || `anim_${animations.length}`, -1, tracks))
    }

    return animations
  }

  private parseGeometry(gltf: GLTF, primitive: GLTFPrimitive, buffers: ArrayBuffer[]): BufferGeometry {
    const geometry = new BufferGeometry()

    for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes)) {
      const accessor = gltf.accessors![accessorIndex]
      const data = this.getAccessorData(gltf, accessor, buffers)
      const itemSize = this.getItemSize(accessor.type)
      let bufferName: string;
      let finalData = data;

      switch (attributeName) {
        case 'POSITION': bufferName = 'position'; break;
        case 'NORMAL': bufferName = 'normal'; break;
        case 'JOINTS_0': 
          bufferName = 'skinIndex'; 
          if (data instanceof Uint8Array) {
            finalData = new Uint16Array(data);
          }
          break;
        case 'WEIGHTS_0': 
          bufferName = 'skinWeight'; 
          if (data instanceof Uint8Array) {
            finalData = new Float32Array(data.length);
            const s = 1.0 / 255.0;
            for (let i = 0; i < data.length; i++) finalData[i] = data[i] * s;
          } else if (data instanceof Uint16Array) {
            finalData = new Float32Array(data.length);
            const s = 1.0 / 65535.0;
            for (let i = 0; i < data.length; i++) finalData[i] = data[i] * s;
          }
          break;
        default: continue;
      }

      geometry.setAttribute(bufferName, new BufferAttribute(finalData, itemSize))
    }

    if (primitive.indices !== undefined) {
      const accessor = gltf.accessors![primitive.indices]
      const data = this.getAccessorData(gltf, accessor, buffers)
      geometry.setIndex(new BufferAttribute(data, 1))
    }

    if (!geometry.attributes.normal && geometry.index) {
      geometry.computeVertexNormals()
    }

    return geometry
  }

  private getAccessorData(gltf: GLTF, accessor: GLTFAccessor, buffers: ArrayBuffer[]): TypedArray {
    const bufferView = gltf.bufferViews![accessor.bufferView!]
    const buffer = buffers[bufferView.buffer]
    const componentType = accessor.componentType
    const TypedArray = this.getTypedArray(componentType)
    const itemSize = this.getItemSize(accessor.type)
    const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const elementCount = accessor.count * itemSize

    return new TypedArray(buffer, byteOffset, elementCount)
  }

  private getTypedArray(componentType: number): any {
    switch (componentType) {
      case 5120: return Int8Array
      case 5121: return Uint8Array
      case 5122: return Int16Array
      case 5123: return Uint16Array
      case 5125: return Uint32Array
      case 5126: return Float32Array
      default: throw new Error(`Unsupported componentType: ${componentType}`)
    }
  }

  private getItemSize(type: string): number {
    switch (type) {
      case 'SCALAR': return 1
      case 'VEC2': return 2
      case 'VEC3': return 3
      case 'VEC4': return 4
      case 'MAT2': return 4
      case 'MAT3': return 9
      case 'MAT4': return 16
      default: throw new Error(`Unsupported type: ${type}`)
    }
  }
}