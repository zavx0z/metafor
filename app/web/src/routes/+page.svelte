<script lang="ts">
  import TestMachine from "$lib/TestMachine"
  import Scene from "$lib/components/Scene.svelte"
  import { simulatorMachine } from "$lib/simulator"
  import { Canvas } from "@threlte/core"
  import { createActor } from "xstate"

  const actor = createActor(simulatorMachine, {
    input: {
      machine: TestMachine,
      state: TestMachine.getInitialSnapshot(null as any),
    },
  }).start()
</script>

<div>
  <Canvas>
    <Scene {actor} />
  </Canvas>
</div>

<style>
  :global(body) {
    margin: 0;
  }
  div {
    width: 100vw;
    height: 100vh;
    background: rgb(13, 19, 32);
    background: linear-gradient(180deg, rgba(13, 19, 32, 1) 0%, rgba(8, 12, 21, 1) 100%);
  }
</style>
