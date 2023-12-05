<script lang="ts">
  const getIcon = (icons: { [key: string]: any }, iconName: string) => {
    return icons[iconName as keyof typeof icons]
  }
</script>

<h1 class="text-primary-400 m-4 text-center text-4xl">@lib/icons</h1>
<div class="flex gap-4 px-4 flex-col">
  {#await import("$lib")}
    <div />
  {:then icons}
    {#each Object.keys(icons) as iconName}
      <span class="flex gap-1 text-primary-500">
        <svelte:component this={getIcon(icons, iconName)} />
        <span class="cursor-default">{iconName}</span>
      </span>
    {/each}
  {:catch error}
    <div>
      {JSON.stringify(error)}
    </div>
  {/await}
</div>
