<script lang="ts">
  import { T } from "@threlte/core"
  import { DoubleSide } from "three"
  import { degToRad } from "three/src/math/MathUtils.js"

  export let rotation = [degToRad(90), 0, 0]
  export let scale = 1
  export let color = "white"
  export let emissiveIntensity = 2
  export let radius = 1
  export let tube = 1
  export let position = [0, 0, 0]
  export let radialSegments = 11
  export let tubularSegments = 22
  export let opacity: number = 1
</script>

<T.Mesh {position} {rotation} scale={[scale, scale, scale]}>
  <T.TorusGeometry args={[radius, tube, radialSegments, tubularSegments]} />
  <T.MeshStandardMaterial {color} {opacity} wireframe transparent emissive={color} {emissiveIntensity} />
</T.Mesh>
