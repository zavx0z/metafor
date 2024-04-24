<script lang="ts">
  import { ripple } from "svelte-ripple-action"

  export let href = " "
  export let label = href
  export let active: boolean = false
  let className = ""
  export { className as class }
</script>

<a
  use:ripple
  on:click
  {href}
  data-active={active}
  class="flex h-12 w-full cursor-pointer place-items-center border-b-[1px] border-solid border-surface-900 bg-transparent px-2 text-primary-700 hover:text-primary-500 data-[active=true]:bg-surface-700 data-[active=true]:text-primary-500 {className}"
  aria-label={label}
>
  <slot />
</a>
