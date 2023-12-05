<script>
  import "../lib/app.css"
  // import { Activity, Button } from "@lib/ui/activity"
  // import { BotikIcon } from "@lib/icons"
  // import { page } from "$app/stores"
  const menuItems = [
    { title: "главная", link: "/" },
    { title: "библиотека", link: "/lib" },
    { title: "эксперименты", link: "/playground" },
    { title: "полигон", link: "/polygon" },
  ]
</script>

<svelte:head>
  <title>@lib/viz</title>
</svelte:head>
<!-- <Activity>
  <div>
    <Button href="/" label="главная" active={$page.url.pathname === "/"}>
      <BotikIcon />
    </Button>
    <Button href="/colors" label="colors" active={$page.url.pathname.includes("colors")}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
        ><path
          fill="currentColor"
          d="M7.08 11.25A4.84 4.84 0 0 1 8 9.05L4.43 5.49A9.88 9.88 0 0 0 2 11.25zM9.05 8a4.84 4.84 0 0 1 2.2-.91V2a9.88 9.88 0 0 0-5.76 2.43zm3.7-6v5A4.84 4.84 0 0 1 15 8l3.56-3.56A9.88 9.88 0 0 0 12.75 2zM8 15a4.84 4.84 0 0 1-.91-2.2H2a9.88 9.88 0 0 0 2.39 5.76zm3.25 1.92a4.84 4.84 0 0 1-2.2-.92l-3.56 3.57A9.88 9.88 0 0 0 11.25 22zM16 9.05a4.84 4.84 0 0 1 .91 2.2h5a9.88 9.88 0 0 0-2.39-5.76zM15 16a4.84 4.84 0 0 1-2.2.91v5a9.88 9.88 0 0 0 5.76-2.39zm1.92-3.25A4.84 4.84 0 0 1 16 15l3.56 3.56A9.88 9.88 0 0 0 22 12.75z"
        /></svg
      >
    </Button>
    <Button href="/playground" label="playground" active={$page.url.pathname.includes("playground")}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
        <path
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M42.8 38.73L29 17.16v-9h1.32a1.81 1.81 0 1 0 0-3.62h-12.7a1.81 1.81 0 0 0 0 3.62h1.32v9L5.2 38.73a1.71 1.71 0 0 0-.29 1a1.79 1.79 0 0 0 1.81 1.77h34.56a1.81 1.81 0 0 0 1.59-.94a1.77 1.77 0 0 0-.07-1.83Zm-31.41-9.65h25.22"
        />
      </svg>
    </Button>
    <Button href="/polygon" label="polygon" active={$page.url.pathname.includes("polygon")}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256"
        ><path
          fill="currentColor"
          d="M227.81 52.19a28 28 0 0 0-39.6 0a27.84 27.84 0 0 0-5.88 8.65l-34.56-9.42a28 28 0 0 0-47.57-23.23a28.05 28.05 0 0 0-3.48 35.37L57.91 98.49a28 28 0 0 0-37.72 1.71a28 28 0 0 0 39.6 39.6l.18-.19l75.32 55.24A28 28 0 1 0 173 183.2l29.56-83.75a28.52 28.52 0 0 0 5.44.55a28 28 0 0 0 19.8-47.79ZM105.86 33.85a20 20 0 1 1 0 28.29a20 20 0 0 1 0-28.29Zm-80 100.29a20 20 0 1 1 28.28 0a20 20 0 0 1-28.29 0Zm148.3 88a20 20 0 1 1 0-28.28a20 20 0 0 1-.01 28.29Zm-8.7-41.6a28 28 0 0 0-25.25 7.66l-.18.19l-75.32-55.23a28.13 28.13 0 0 0-1.44-28.73l38.81-34.93a28 28 0 0 0 43.6-10.36l34.56 9.43a28 28 0 0 0 8 23.22a27.64 27.64 0 0 0 6.8 5Zm56.7-94.41a20 20 0 1 1 0-28.29a20 20 0 0 1-.01 28.3Z"
        /></svg
      >
    </Button>
    <Button href="/info" label="info" active={$page.url.pathname.includes("info")}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 28 28"
        ><path
          fill="currentColor"
          d="M15 8a1 1 0 1 1-2 0a1 1 0 0 1 2 0Zm-1.75 3.75v7.5a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-1.5 0ZM2 14C2 7.373 7.373 2 14 2s12 5.373 12 12s-5.373 12-12 12S2 20.627 2 14ZM14 3.5C8.201 3.5 3.5 8.201 3.5 14S8.201 24.5 14 24.5S24.5 19.799 24.5 14S19.799 3.5 14 3.5Z"
        /></svg
      >
    </Button>
  </div>
</Activity> -->
<div class="ml-12">
  <slot />
</div>
