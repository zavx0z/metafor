<script lang="ts">
  export let position: "left" | "right" = "left"
</script>

<nav class="fixed inset-y-0 {`${position}-0`} z-40 flex h-12 w-12 flex-col items-center justify-between justify-items-center bg-surface-900/90 backdrop-blur-sm">
  <slot />
</nav>
