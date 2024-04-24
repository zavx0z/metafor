<script lang="ts">
  import { CallIcon } from "@lib/icons"
  import { ripple } from "svelte-ripple-action"
</script>

<button
  use:ripple
  class={"text-surface-700 flex h-24 w-24 items-center justify-center rounded-md bg-green-500 hover:bg-green-400"}
  on:click
>
  <CallIcon size="40" />
</button>
