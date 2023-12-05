<script lang="ts">
  import { T } from "@threlte/core"
  import { ContactShadows, GLTF, Grid, OrbitControls, useGltf } from "@threlte/extras"
  import Space from "./Space.svelte"
  import type { SimulatorActorType } from "$lib/simulator"
  import type { DirectedGraphEdge } from "$lib/types"
  import type { AnyStateNode } from "xstate"
  import Thing from "./thing/Thing.svelte"
  import { thingMachine } from "./machine"
  import Bots from "../../Bots.svelte"

  export let actor: SimulatorActorType
  let edges: { [key: string]: DirectedGraphEdge } = {}
  let nodes: { [key: string]: AnyStateNode } = {}
  let digraph: any
</script>

<Space {actor} bind:edges bind:nodes bind:digraph>
  <T.PerspectiveCamera makeDefault position={[0, 4, 9]} fov={15}>
    <OrbitControls autoRotate enableZoom={true} enableDamping autoRotateSpeed={2} target.y={.8} />
  </T.PerspectiveCamera>
  <T.AmbientLight intensity={0.5} />
  <T.DirectionalLight args={["#fff", 0.5]} intensity={0.6} />
  <Grid
    position.y={-0.001}
    cellColor="#324560"
    sectionColor="#1b2634"
    sectionThickness={0}
    fadeDistance={14}
    cellSize={1}
  />
  <ContactShadows
    resolution={44}
    depthWrite={true}
    color={"#87ceeb"}
    smooth={true}
    scale={7}
    blur={7}
    far={1.8}
    opacity={0.7}
  />
  <!-- <GLTF castShadow receiveShadow url={"../bots.glb"} position={{ y: 1 }} scale={3} /> -->
  <Bots />
  <Thing machine={thingMachine} />
  <!-- {#if $gltf}
    <T is={$gltf.nodes["node-name"]} />
  {/if} -->
</Space>
