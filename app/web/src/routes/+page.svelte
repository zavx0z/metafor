<script lang="ts">
  const { PROD } = import.meta.env
  import { themeColorHEX } from "@lib/theme"
  $effect(() => {
    import(
      PROD
        ? "https://zavx0z.github.io/view-port-threlte/dist/view-port.js"
        : "/home/zavx0z/view-port-threlte/dist/view-port.js"
    ).then(() => console.log("WC view-port Loaded"))
  })
  const ViewPort = (node: HTMLElement) => {
    // console.log({ node })
  }
</script>

<main>
  <view-port
    use:ViewPort
    cellColor={themeColorHEX("--color-primary-900")}
    sectionColor={themeColorHEX("--color-primary-900")}
  />
</main>