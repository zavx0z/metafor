<script lang="ts">
  import { Text } from "@threlte/extras"
  export let tY = 0.12
  // export let bY = -0.18
  let fontSize = 0.08
</script>

<Text position.y={tY} {fontSize} text={"invite"} anchorX={"center"} anchorY={"top-baseline"} curveRadius={10} />
<!-- <Text position.y={bY} {fontSize} text={"join"} anchorX={"center"} anchorY={"bottom-baseline"} curveRadius={10} /> -->
