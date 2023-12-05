<script lang="ts">
  import { LoginIcon } from "@lib/icons"
  import Button from "./Button.svelte"

  export let session = false
  export let src = ""
  export let alt = "avatar"
  export let profileHref = "profile"
  export let profileActive: boolean = false
  export let loginHref = "login"
</script>

{#if session}
  <Button href={profileHref} label="Профиль пользователя" active={profileActive}>
    <div class="flex h-8 w-8 items-center justify-center rounded-3xl bg-surface-800">
      {#if src}
        <img {alt} class="h-full w-full rounded-[inherit]" {src} />
      {:else}
        <span class="text-sm font-medium uppercase text-primary-500">
          {alt.slice(0, 2)}
        </span>
      {/if}
    </div>
  </Button>
{:else}
  <Button href={loginHref} label="Авторизация">
    <LoginIcon />
  </Button>
{/if}
