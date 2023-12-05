<script lang="ts">
  import { T } from "@threlte/core"
  import { ContactShadows, Float, Grid, OrbitControls } from "@threlte/extras"
  import Space from "./Space.svelte"
  import type { SimulatorActorType } from "$lib/simulator"
  import type { DirectedGraphEdge } from "$lib/types"
  import type { AnyStateNode } from "xstate"
  import Thing from "./thing/Thing.svelte"
  import { thingMachine } from "./machine"
  import Bots from "../bots/Bots.svelte"
  import Telegram from "$lib/telegram/Telegram.svelte"
  import { themeColorHEX } from "@lib/theme"

  export let actor: SimulatorActorType
  let edges: { [key: string]: DirectedGraphEdge } = {}
  let nodes: { [key: string]: AnyStateNode } = {}
  let digraph: any
</script>

<Space {actor} bind:edges bind:nodes bind:digraph>
  <T.PerspectiveCamera makeDefault position={[0, 4, 9]} fov={15}>
    <OrbitControls autoRotate enableZoom={true} enableDamping autoRotateSpeed={2} target.y={0.8} />
  </T.PerspectiveCamera>
  <T.AmbientLight intensity={0.5} />
  <T.DirectionalLight args={["#fff", 0.5]} intensity={0.6} />
  <Grid
    position.y={-0.001}
    cellColor={themeColorHEX("--color-primary-900")}
    sectionColor={themeColorHEX("--color-primary-900")}
    sectionThickness={1}
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
  <Telegram />
  <Bots />
  <Thing machine={thingMachine} />
</Space>
