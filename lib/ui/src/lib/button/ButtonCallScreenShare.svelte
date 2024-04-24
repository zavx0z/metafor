<script lang="ts">
  import { ScreenShareIcon } from "@lib/icons"
  import { ripple } from "svelte-ripple-action"

  export let size: "sm" | "lg" = "lg"
  export let title = ""
  let buttonSize = 12
  switch (size) {
    case "sm":
      buttonSize = 12
      break
    case "lg":
      buttonSize = 24
      break
    default:
      buttonSize = 12
  }
</script>

<button
  use:ripple
  {title}
  class={`text-surface-700 h-${buttonSize} flex  w-${buttonSize} items-center justify-center rounded-md bg-green-500 hover:bg-green-400`}
  on:click
>
  <ScreenShareIcon />
</button>
