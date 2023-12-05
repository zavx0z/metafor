<script lang="ts">
  import { ripple } from "svelte-ripple-action"

  export let href = " "
  export let label: string = ""
  export let active: boolean = false
  let className = ""
  export { className as class }
</script>

<a
  use:ripple
  on:click
  title={label}
  {href}
  data-active={active}
  class="grid h-12 w-12 cursor-pointer place-items-center bg-transparent text-primary-700 hover:text-primary-500 data-[active=true]:bg-surface-800 data-[active=true]:text-primary-500 {className}"
  aria-label={label || href}
>
  <slot />
</a>
