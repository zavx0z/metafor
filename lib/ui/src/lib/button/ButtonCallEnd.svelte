<script lang="ts">
  import { CallIcon } from "@lib/icons"
  import { ripple } from "svelte-ripple-action"
</script>

<button
  use:ripple
  class={"text-surface-700 flex h-24 w-24 items-center justify-center rounded-md bg-red-500 hover:bg-red-400"}
  on:click
>
  <span class=" rotate-[119deg]">
    <CallIcon size="44" />
  </span>
</button>
