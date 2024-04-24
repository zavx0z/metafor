<script context="module">
  let counter = 0
</script>

<script lang="ts">
  let { username } = $props<{ username: String }>()

  let eltId = "username_" + counter++
</script>

<fieldset class="mb-4">
  <label for={eltId}> Пользователь </label>
  <!-- svelte-ignore a11y-autofocus -->
  <input id={eltId} placeholder="логин" name="username" bind:value={username} required class="text-primary-50" />
</fieldset>
