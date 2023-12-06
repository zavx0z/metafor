<script>
  import { Group } from "three"
  import { T, forwardEventHandlers } from "@threlte/core"
  import { interactivity, useGltf, useGltfAnimations } from "@threlte/extras"
  import model from "$lib/bots/bots.glb?url"
  const gltf = useGltf(model)

  interactivity()
  export const ref = new Group()
  export const { actions } = useGltfAnimations(gltf, ref)

  $: Object.entries($actions).forEach(([_, value]) => {
    value?.play()
  })
  const component = forwardEventHandlers()
</script>

<T is={ref} dispose={false} {...$$restProps} bind:this={$component}>
  {#await gltf}
    <slot name="fallback" />
  {:then gltf}
    <T.Group name="Armature001" position={[0, 0, 0.59]} rotation={[Math.PI / 2, 0, 3.11]} scale={0.01}>
      <T is={gltf.nodes.mixamorigHips} />
      <T.SkinnedMesh
        name="Beta_Joints"
        geometry={gltf.nodes.Beta_Joints.geometry}
        material={gltf.materials.Beta_Joints_MAT1}
        skeleton={gltf.nodes.Beta_Joints.skeleton}
      />
      <T.SkinnedMesh
        name="Beta_Surface"
        geometry={gltf.nodes.Beta_Surface.geometry}
        material={gltf.materials.Beta_HighLimbsGeoSG3}
        skeleton={gltf.nodes.Beta_Surface.skeleton}
      />
    </T.Group>
    <T.Group name="Armature" position={[0, 0, -0.59]} rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
      <T is={gltf.nodes.mixamorigHips_1} />
      <T.SkinnedMesh
        name="Alpha_Joints"
        geometry={gltf.nodes.Alpha_Joints.geometry}
        material={gltf.materials["Alpha_Joints_MAT.001"]}
        skeleton={gltf.nodes.Alpha_Joints.skeleton}
      />
      <T.SkinnedMesh
        name="Alpha_Surface"
        geometry={gltf.nodes.Alpha_Surface.geometry}
        material={gltf.materials["Alpha_Body_MAT.001"]}
        skeleton={gltf.nodes.Alpha_Surface.skeleton}
      />
    </T.Group>
  {:catch error}
    <slot name="error" {error} />
  {/await}

  <slot {ref} />
</T>
