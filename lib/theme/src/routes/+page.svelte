<script lang="ts">
  import "../lib/app.css"
  import style from "../lib/css/tailwind.css?inline"

  type ColorType = {
    [colorName: string]: {
      [colorWeight: string]: number[];
    };
  };

  const extractColors = (css: string): ColorType => {
    const colorRegex = /--color-(\w+)-(\d+): (\d+ \d+ \d+);/g
    const colors: ColorType = {}
    let match: RegExpExecArray | null

    while (match = colorRegex.exec(css)) {
      const [_, colorName, colorWeight, colorValues] = match

      if (!colors[colorName])
        colors[colorName] = {}

      colors[colorName][colorWeight] = colorValues.split(" ").map(Number)
    }
    return colors
  }
  let colors = extractColors(style)
</script>
<svelte:head>
  <title>
    @lib/theme
  </title>
</svelte:head>
<div class="flex h-screen flex-col justify-between items-center w-screen gap-4">
  <h1 class="m-4 text-center text-4xl text-primary-400">@lib/theme</h1>
  <div class="flex gap-2 2xl:w-1/3  lg:w-1/2 w-screen px-2 flex-1 items-center">
    {#each Object.keys(colors) as colorName}
      <div class="flex flex-col w-full">
        <h2 class="text-center capitalize font-bold border-primary-900 border-2">{colorName}</h2>
        {#each Object.keys(colors[colorName]) as colorWeight}
          <div class="h-7" style="background-color: rgb({colors[colorName][colorWeight].join(',')})">
            {colorWeight}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <!--  <div class="flex w-full flex-1 flex-col items-center gap-2 text-2xl">-->
  <!--    <a class="underline text-primary-500" href=" ">ссылка</a>-->
  <!--  </div>-->
</div>