<script lang="ts">
  import Particle from "./Particle.svelte"
  import type { AnyStateMachine } from "xstate"
  import { useActor, useSelector } from "@xstate/svelte"
  import { Float } from "@threlte/extras"
  import Torus from "./Torus.svelte"

  let level = 1
  export let machine: AnyStateMachine
  let { snapshot, send, actorRef } = useActor(machine, {
    input: {
      parent: {
        position: [0, 0.87, 0],
        scale: 0.22,
      },
      params: {},
      tor: {
        radius: level,
        tube: level / 2,
        material: {
          opacity: 0.1,
          color: " #426573",
          emissive: 0.001,
        },
      },
    },
  })

  const positionParent = useSelector(actorRef, (snapshot) => snapshot.context.parent.position)
  const scaleParent = useSelector(actorRef, (snapshot) => snapshot.context.parent.scale)
  const position = useSelector(actorRef, (snapshot) => snapshot.context.params.position)
  const materialTor = useSelector(actorRef, (snapshot) => snapshot.context.tor.material)

  let scale = level / 2

  let Intensity = 0.2
  let speed = 14

  let x = -$position[0] - $positionParent[0]
  let y = -$position[1] + $positionParent[1] - $snapshot.context.tor.radius
  let z = -$position[2] - $positionParent[2]
  let opacityMaterial = 0.6
</script>

<Float {speed} rotationSpeed={speed} rotationIntensity={Intensity} floatIntensity={Intensity}>
  <Torus
    scale={$scaleParent}
    position={[x, y, z]}
    color={$materialTor.color}
    opacity={$materialTor.opacity}
    emissiveIntensity={$materialTor.emissive}
    radius={$snapshot.context.tor.radius}
    tube={$snapshot.context.tor.tube}
  />
  <Particle
    rotationSpeed={0}
    rotationIntensity={0}

    position={[x, y, z]}
    detail={2}
    scale={scale * 1.4 * $scaleParent}
    color={"#7d6639"}
    colorBase={"#e6bc69"}
    emissive={1}
    opacity={1}
    {opacityMaterial}
  />
  <Particle
    position={[scale * $scaleParent + 0.1, y, z]}
    rotationSpeed={12}
    rotationIntensity={0.3}
    detail={1}
    color={"#7d4545"}
    colorBase={"#FF8D8D"}
    scale={scale * $scaleParent}
    opacity={1}
    {opacityMaterial}
    emissive={0.7}
  />
  <Particle
    rotationSpeed={12}
    color={"#426573"}
    colorBase={"#7ab9d4"}
    position={[-scale * $scaleParent - 0.1, y, z]}
    detail={1}
    scale={scale * $scaleParent}
    opacity={1}
    {opacityMaterial}
    emissive={0.7}
  />
</Float>
