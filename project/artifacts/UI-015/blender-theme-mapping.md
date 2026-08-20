# UI-015.8 — Blender 4.5.5 theme role mapping

Статус: `PROPOSED FOR BLENDER STYLE REVIEW`. Production `theme.ts` values ещё
не менялись.

## Версионная граница

Runtime/catalog — Blender `4.5.5`; local sparse source — `4.5.12`. Три exact
official tag files byte-identical между `v4.5.5` и `v4.5.12`:

| Source | SHA-256 |
| --- | --- |
| `release/datafiles/userdef/userdef_default_theme.c` | `1871145a25268d3310f3e0d8ae54ed6892f4ebb0a5d57399b899bef7dc0adbd3` |
| `source/blender/editors/interface/interface_widgets.cc` | `72eac700ab7949dac5ab424dc06041740d58d6c174a781e3adb820c74ffeb66f` |
| `source/blender/editors/interface/resources.cc` | `65a199253a39994620f1ba6f10cff239690af925d7d9f73ed1b10a02f9c2ed06` |

Theme values и state functions ниже применимы к exact 4.5.5 boundary. Visual
acceptance всё равно использует 4.5.5 captures/runtime.

## Предлагаемый raw public contract

```ts
export type BlenderRgba8 = readonly [r: number, g: number, b: number, a: number]

export type BlenderWidgetClass =
  | "regular" | "text" | "number" | "numberSlider"
  | "menu" | "menuBack" | "menuItem" | "box" | "listItem" | "scroll"

export type BlenderWidgetColorSet = Readonly<{
  outline: BlenderRgba8
  inner: BlenderRgba8
  innerSelected: BlenderRgba8
  item: BlenderRgba8
  text: BlenderRgba8
  textSelected: BlenderRgba8
  roundness: number
}>

export type BlenderWidgetState = Readonly<{
  hovered?: boolean
  pressed?: boolean
  selected?: boolean
  activeDefault?: boolean
  disabled?: boolean
  inactive?: boolean
  searchNoMatch?: boolean
  textInput?: boolean
  listItem?: boolean
  numericZone?: "left" | "center" | "right" | null
}>

export type ResolvedBlenderWidgetColors = Readonly<{
  outline: BlenderRgba8
  inner: BlenderRgba8
  item: BlenderRgba8
  text: BlenderRgba8
  roundness: number
}>

export function resolveWidgetColors(
  kind: BlenderWidgetClass,
  state?: BlenderWidgetState,
): ResolvedBlenderWidgetColors
```

Raw theme дополнительно публикует отдельные immutable namespaces `state`,
`material` и `spaceNode`. Resolver возвращает новый frozen result и не меняет
raw source sets.

## Raw widget sets

RGBA сохранён в source byte order, включая прозрачность.

| Class | outline | inner | inner selected | item | text | text selected | roundness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `regular` | `#3d3d3dff` | `#545454ff` | `#4772b3ff` | `#1d1d1d80` | `#e6e6e6ff` | `#ffffffff` | `.2` |
| `text` | `#3d3d3dff` | `#1d1d1dff` | `#181818ff` | `#ffffff33` | `#e6e6e6ff` | `#ffffffff` | `.2` |
| `number` | `#3d3d3dff` | `#545454ff` | `#222222ff` | `#4772b3ff` | `#e6e6e6ff` | `#ffffffff` | `.2` |
| `numberSlider` | `#3d3d3dff` | `#545454ff` | `#222222ff` | `#4772b3ff` | `#e6e6e6ff` | `#ffffffff` | `.2` |
| `menu` | `#3d3d3dff` | `#282828ff` | `#4772b3b3` | `#d9d9d9ff` | `#e6e6e6ff` | `#ffffffff` | `.2` |
| `menuBack` | `#242424ff` | `#181818ff` | `#4772b3ff` | `#d9d9d9ff` | `#999999ff` | `#ffffffff` | `.2` |
| `menuItem` | `#3d3d3d00` | `#18181800` | `#4772b3ff` | `#ffffff8f` | `#ddddddff` | `#ffffffff` | `.2` |
| `box` | `#3d3d3dff` | `#1d1d1d80` | `#545454ff` | `#191919ff` | `#e6e6e6ff` | `#ffffffff` | `.2` |
| `listItem` | `#2d2d2dff` | `#ffffff00` | `#4772b3ff` | `#ffffff33` | `#ccccccff` | `#ffffffff` | `.2` |
| `scroll` | `#3d3d3dff` | `#22222200` | `#ffffffff` | `#545454ff` | `#e6e6e6ff` | `#ffffffff` | `.5` |

## State resolver laws

| Scope | Source anchor | Law |
| --- | --- | --- |
| generic selected/pressed | `widget_state`, `UI_SELECT` | `inner ← innerSelected`, `text ← textSelected`; number remains `#222222`, its blue lives in `item` |
| generic hover | `widget_active_color` | HSL saturation `×1.15`; inner lightness `×1.2` for dark theme, outline `×1.15`, text `×1.25` |
| generic disabled/inactive | `widget_alpha_factor` + `ui_widget_color_disabled` | alpha `×0.5`; disabled + search-no-match `×0.25` |
| text input | `wcol_text`, `widget_text_cursor` | active background `#181818`; selection item `#ffffff33`; caret `#71a8ffff` |
| menu item selected | `widget_state_menu_item` | `inner ← #4772b3ff`, `text ← #ffffffff` |
| menu item hover | `widget_state_menu_item` | blend transparent inner toward text by `.2`, then alpha `255`; text becomes selected |
| menu item disabled | `widget_state_menu_item` | text alpha `128`; disabled+hover uses text blend `.5`, inner alpha `64` |
| numeric hover zones | `widget_numbut_draw` | left/center/right zones use `item` and zone-specific `widget_active_color`; not a global hover fill |
| list item | `UI_BUT_LIST_ITEM` in `widget_state` | resolver switches to `listItem` raw set before selected/disabled state |

## Material and non-widget roles

| Blender field | Raw value | Planned owner |
| --- | --- | --- |
| `widget_emboss` | `#00000026` | control material emboss |
| `menu_shadow_fac` | `.4` | popup shadow opacity |
| `menu_shadow_width` | `2` | popup shadow width |
| `editor_border` | `#161616ff` | region divider |
| `editor_outline` | `#ffffff15` | inactive editor outline |
| `editor_outline_active` | `#ffffff2a` | active editor outline |
| checker primary/secondary | `#333333ff` / `#262626ff` | alpha background |
| checker size | `8` | alpha checker geometry |
| `panel_roundness` | `.4` | panel-only source role, not control radius |
| `widget_text_cursor` | `#71a8ffff` | text caret |

Generic disabled alpha is not used for special menu-row disabled states.

## State и Space Node namespaces

`state`: error `#771111ff`, warning `#ac8737ff`, info `#28487dff`, success
`#188625ff`. Эти роли не заменяют application badges автоматически.

Axes: X `#ff3352ff`, Y `#8bdc00ff`, Z `#2890ffff`.

`spaceNode`: raw back `#1d1d1d00`, header `#1d1d1db3`, navigation
`#1d1d1dff`, execution `#303030ff`, panel header/back `#3d3d3dff`, panel sub
`#0000001f`, tab active `#303030ff`, inactive `#1d1d1dff`, outline
`#3d3d3dff`, list `#303030ff`. Node-class colors остаются отдельными raw
fields следующего Node consumer slice.

Root WebGPU canvas обязан быть opaque. Его resolved color будет отдельным
documented composite/capture result; raw `spaceNode.back` alpha `00` не
переписывается в source set.

## Compatibility mapping для текущих consumers

| Current token | Blender owner после migration | Ограничение |
| --- | --- | --- |
| `text` | class-specific `.text`, обычно `#e6e6e6ff` | selected использует `.textSelected` |
| `muted` | `menuBack.text` либо `listItem.text` по consumer class | одного universal muted для поведения нет |
| `bgInput` | только compatibility alias для `text.inner` | Number и Menu не используют его |
| `bgHot` | удаляется как источник state behavior | state получает resolver result |
| `cyan` | не является generic hover/active owner | может остаться временным API alias до consumer migration |
| `activeRowFill` | `listItem.innerSelected` | только list rows |
| `border*` | class `.outline` или editor/menu role | один border token не управляет всеми widgets |
| `bg` | resolved opaque Node/editor canvas | raw source alpha сохраняется отдельно |

Первый consumer slice переводит Element `button`, `input`, `select`, List,
Component Number и shared Workbench. После него те же Text/Number/Menu states
проверяются внутри Node Parameter.

## Visual state matrix после допуска

Один и тот же DPR/target/route для before/after:

1. Button: idle, hover, pressed, selected, disabled.
2. Text: idle, focused, selection/caret, disabled/read-only.
3. Number/slider: idle, center/left/right hover, edit/pressed, disabled.
4. Menu: closed idle/hover/pressed; popup row idle/hover/selected/disabled.
5. List: idle/hover/selected/disabled.
6. Те же Text/Number/Menu внутри expanded Node.

Automated PNG и unit tests не ставят owner acceptance.
