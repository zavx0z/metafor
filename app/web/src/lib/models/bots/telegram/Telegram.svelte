<script lang="ts">
  import { Group } from "three"
  import { T, forwardEventHandlers, useFrame, useTask, useThrelte } from "@threlte/core"
  import { Float, useGltf } from "@threlte/extras"
  import { interactivity } from "@threlte/extras"
  import { spring } from "svelte/motion"
  import model from "$lib/telegram/telegram.glb?url"
  import Title from "./Title.svelte"

  export const ref = new Group()

  interactivity()
  const initSpring = {
    stiffness: 0.5, // по умолчанию 0.15 — значение от 0 до 1, где большее значение означает «более тугую» пружину.
    damping: 1, // по умолчанию 0.8 — значение от 0 до 1, где меньшее значение означает более упругую пружину.
    precision: 0.005, // 0.01) — определяет порог, при котором пружина считается «установившейся», где меньшее значение означает более точное
  }
  const scale = spring(0.1, initSpring)

  const gltf = useGltf(model)

  const component = forwardEventHandlers()
  useFrame(({ camera }) => {
    ref.lookAt(camera.current.position)
  })

  let position = [0, 1.8, -0.04]
  let rotation = [0, Math.PI / 2, Math.PI / 2]
</script>

<Float floatIntensity={0.004} rotationIntensity={0} speed={12} {position}>
  <T is={ref} dispose={false} {...$$restProps} bind:this={$component}>
    <Title />
    {#await gltf}
      <slot name="fallback" />
    {:then gltf}
      <T.Group
        on:click={() => {
          scale.stiffness = 0.4
          scale.damping = 0.4
          scale.set(0.14).then(() => {
            scale.damping = initSpring.damping
            scale.set(0.12)
          })
          window
            .open(
              // "https://t.me/zavx0zMetaFor"
              "https://t.me/+KbHj7frVRUJmNGQy",
              "_blank"
            )
            ?.focus()
        }}
        interactive
        {rotation}
        scale={[1 * $scale, 0.09 * $scale, 1 * $scale]}
      >
        <T.Mesh
          on:pointerenter={() => {
            scale.stiffness = initSpring.stiffness
            scale.damping = initSpring.damping
            console.log("pointerenter")
            scale.set(0.12, { soft: true })
          }}
          on:pointerleave={() => {
            scale.stiffness = initSpring.stiffness
            scale.damping = initSpring.damping
            console.log("pointerleave")
            scale.set(0.1, { soft: true })
          }}
          geometry={gltf.nodes.Object_4.geometry}
          material={gltf.materials.material}
        />
        <T.Mesh
          geometry={gltf.nodes.Object_6.geometry}
          material={gltf.materials["Material.002"]}
          position={[-0.01, 0.86, -0.08]}
          rotation={[-Math.PI, 0.26, -Math.PI]}
          scale={[1, 10.86, 1]}
        />
      </T.Group>
    {:catch error}
      <slot name="error" {error} />
    {/await}

    <slot {ref} />
  </T>
</Float>
<!-- on:click={(e) => console.log("click")}
on:contextmenu={(e) => console.log("context menu")}
on:dblclick={(e) => console.log("double click")}
on:wheel={(e) => console.log("wheel")}
on:pointerup={(e) => console.log("up")}
on:pointerdown={(e) => console.log("down")}
on:pointerover={(e) => console.log("over")}
on:pointerout={(e) => console.log("out")}
on:pointerenter={(e) => console.log("enter")}
on:pointerleave={(e) => console.log("leave")}
on:pointermove={(e) => console.log("move")}
on:pointermissed={() => console.log("missed")} -->
