<script lang="ts">
  import { Float } from "@threlte/extras"
  import { T } from "@threlte/core"
  import { DoubleSide } from "three"
  export let position: [number, number, number] = [0, 0, 0]
  export let rotation: [number, number, number] = [0, 0, 0]
  export let scale: number = 1
  export let radius = 0.5
  export let detail = 4
  export let color = "#2a3a50"
  export let colorBase = "#fff"
  export let opacity = 0.44
  export let emissive = 1.2
  export let speed = 15
  export let floatIntensity = 0.1
  export let rotationIntensity = 0.4
  export let rotationSpeed = 0.3
  export let opacityMaterial = 0.55
</script>

<Float {rotationSpeed} {rotationIntensity} {speed} {floatIntensity}>
  <T.Mesh {position} {rotation}>
    <T.IcosahedronGeometry args={[radius * scale, detail]} />
    <T.MeshStandardMaterial
      side={DoubleSide}
      {color}
      transparent
      {opacity}
      emissive={color}
      emissiveIntensity={emissive}
      wireframe
    />
  </T.Mesh>
  <T.Mesh {position} {rotation} scale={[scale, scale, scale]}>
    <T.IcosahedronGeometry args={[radius, detail]} />
    <T.MeshStandardMaterial side={DoubleSide} color={colorBase} transparent opacity={opacityMaterial} />
  </T.Mesh>
</Float>
