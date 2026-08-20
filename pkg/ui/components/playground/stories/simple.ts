import {Badge} from "@ui/components/badge"
import {Checkbox} from "@ui/components/checkbox"
import {ColorInput} from "@ui/components/color-input"
import {Divider, type DividerVariant} from "@ui/components/divider"
import {List} from "@ui/components/list"
import {NumberInput} from "@ui/components/number-input"
import {ProgressCheckbox} from "@ui/components/progress-checkbox"
import {SliderControl} from "@ui/components/slider-control"
import {Switcher} from "@ui/components/switcher"
import {Table} from "@ui/components/table"
import {TextField} from "@ui/components/text-field"
import {Typography} from "@ui/components/typography"
import {scrollbar} from "@ui/elements/scrollbar"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {SimpleComponentStory} from "../stories.ts"

type SimpleStoryArgs = PlaygroundStoryArgs & Readonly<{
  label: string
  checked: boolean
  value: number
  disabled: boolean
}>

type ComponentTableRow = Readonly<{name: string; owner: string}>

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createSimpleComponentStory(options: Readonly<{
  component: SimpleComponentStory
  variant: string
}>): PlaygroundStoryModule {
  const checked = options.variant === "checked" || options.variant === "on"
  return definePlaygroundStoryModule<SimpleStoryArgs>({
    defaultArgs: {
      label: defaultLabel(options.component),
      checked,
      value: options.component === "progress-checkbox" ? 64 : 0.62,
      disabled: false,
    },
    controls: [
      {key: "label", label: "Подпись", group: "Основные", kind: "text"},
      {key: "checked", label: "Включено", group: "Состояние", kind: "boolean"},
      {key: "value", label: "Значение", group: "Состояние", kind: "number"},
      {key: "disabled", label: "Недоступно", group: "Состояние", kind: "boolean"},
    ],
    render(surface, args, frame) {
      renderSimpleStory(surface, args, frame, options)
    },
    source(args) {
      return simpleStorySource(options, args)
    },
  })
}

function renderSimpleStory(
  surface: Parameters<typeof Badge>[0],
  args: SimpleStoryArgs,
  frame: Readonly<{x: number; y: number; w: number; h: number}>,
  options: Readonly<{component: SimpleComponentStory; variant: string}>,
): void {
  const centerX = frame.x + frame.w / 2
  const centerY = frame.y + frame.h * 0.56
  const change = (key: string, value: unknown): void => globalThis.__componentsStoryControlBridge?.(key, value)
  if (options.component === "badge") {
    Badge(surface, centerX - 80, centerY - 17, 160, 34, {children: args.label, color: "success"})
    return
  }
  if (options.component === "text-field") {
    TextField(surface, centerX - 190, centerY - 24, 380, 48, {
      key: "components-story-text",
      value: args.label,
      disabled: args.disabled,
      onChange: (value) => change("label", value),
    })
    return
  }
  if (options.component === "number-input") {
    NumberInput(surface, centerX - 150, centerY - 24, 300, 48, {
      key: "components-story-number",
      value: args.value,
      min: 0,
      max: 1,
      step: 0.01,
      disabled: args.disabled,
      onChange: (value) => change("value", value),
    })
    return
  }
  if (options.component === "color-input") {
    ColorInput(surface, centerX - 170, centerY - 24, 340, 48, {
      key: "components-story-color",
      value: {r: 0.18, g: 0.58, b: 0.92, a: Math.min(1, Math.max(0, args.value))},
      disabled: args.disabled,
      onChange: (value) => change("value", value.a),
    })
    return
  }
  if (options.component === "checkbox") {
    Checkbox(surface, centerX - 24, centerY - 24, 48, 48, {
      checked: args.checked,
      disabled: args.disabled,
      onChange: (value) => change("checked", value),
    })
    return
  }
  if (options.component === "switcher") {
    Switcher(surface, centerX - 30, centerY - 12, 60, 24, {
      checked: args.checked,
      disabled: args.disabled,
      color: "primary",
      onChange: (value) => change("checked", value),
    })
    return
  }
  if (options.component === "progress-checkbox") {
    ProgressCheckbox(surface, centerX - 24, centerY - 24, 48, 48, {
      progress: args.value,
      checked: args.checked,
      disabled: args.disabled,
      onChange: (value) => change("checked", value),
    })
    return
  }
  if (options.component === "slider-control") {
    SliderControl(surface, centerX - 210, centerY - 24, 420, {
      key: "components-story-slider",
      label: args.label,
      value: args.value,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (value) => change("value", value),
    })
    return
  }
  if (options.component === "typography") {
    Typography(surface, centerX - 260, centerY - 70, 520, 34, {children: args.label, variant: "title", sx: {textAlign: "center"}})
    Typography(surface, centerX - 260, centerY - 18, 520, 28, {children: "Основной текст компонента Typography", variant: "body", sx: {textAlign: "center"}})
    Typography(surface, centerX - 260, centerY + 26, 520, 24, {children: "Подпись", variant: "caption", color: "muted", sx: {textAlign: "center"}})
    return
  }
  if (options.component === "divider") {
    const variant = dividerVariant(options.variant)
    Divider(surface, centerX - 240, centerY, 480, {children: args.label, variant})
    return
  }
  if (options.component === "list") {
    List(surface, centerX - 220, centerY - 130, 440, 260, {
      key: "components-story-list",
      subheader: "Компоненты",
      selectedKey: "field",
      items: [
        {key: "button", primary: "Кнопка", secondary: "Button", button: true},
        {key: "field", primary: "Поле", secondary: "Field", button: true},
        {key: "pane", primary: "Панель", secondary: "Pane", button: true},
      ],
    })
    return
  }
  if (options.component === "table") {
    Table<ComponentTableRow>(surface, centerX - 260, centerY - 130, 520, 260, {
      key: "components-story-table",
      columns: [
        {key: "name", label: "Компонент", width: 220, getValue: (row) => row.name},
        {key: "owner", label: "Владелец", width: 260, getValue: (row) => row.owner},
      ],
      rows: [
        {name: "Button", owner: "@ui/components/button"},
        {name: "Field", owner: "@ui/components/field"},
        {name: "Pane", owner: "@ui/components/pane"},
      ],
      getRowId: (row) => row.name,
    })
    return
  }
  if (options.component === "scrollbar") {
    scrollbar(surface, centerX - 2, centerY - 130, 260, {
      offset: Math.round(Math.min(1, Math.max(0, args.value)) * 600),
      visible: 260,
      total: 860,
      trackWidth: 8,
    })
    return
  }
  Typography(surface, centerX - 300, centerY - 38, 600, 32, {
    children: "Noti пока не опубликован в рабочем API",
    variant: "subtitle",
    color: "muted",
    sx: {textAlign: "center"},
  })
  Typography(surface, centerX - 300, centerY + 14, 600, 26, {
    children: "Запись явно сохранена в каталоге и не скрыта недоступным маршрутом.",
    variant: "caption",
    color: "muted",
    sx: {textAlign: "center"},
  })
}

function simpleStorySource(
  options: Readonly<{component: SimpleComponentStory; variant: string}>,
  args: SimpleStoryArgs,
): string {
  const disabled = args.disabled ? ", disabled: true" : ""
  if (options.component === "badge") return `import {Badge} from "@ui/components/badge"\n\nBadge(surface, x, y, w, h, {children: ${JSON.stringify(args.label)}, color: "success"})`
  if (options.component === "text-field") return `import {TextField} from "@ui/components/text-field"\n\nTextField(surface, x, y, w, h, {value: ${JSON.stringify(args.label)}${disabled}, onChange: setValue})`
  if (options.component === "number-input") return `import {NumberInput} from "@ui/components/number-input"\n\nNumberInput(surface, x, y, w, h, {value: ${args.value}, min: 0, max: 1, step: 0.01${disabled}, onChange: setValue})`
  if (options.component === "color-input") return `import {ColorInput} from "@ui/components/color-input"\n\nColorInput(surface, x, y, w, h, {value: {r: 0.18, g: 0.58, b: 0.92, a: ${args.value}}${disabled}, onChange: setValue})`
  if (options.component === "checkbox") return `import {Checkbox} from "@ui/components/checkbox"\n\nCheckbox(surface, x, y, w, h, {checked: ${args.checked}${disabled}, onChange: setChecked})`
  if (options.component === "switcher") return `import {Switcher} from "@ui/components/switcher"\n\nSwitcher(surface, x, y, w, h, {checked: ${args.checked}${disabled}, onChange: setChecked})`
  if (options.component === "progress-checkbox") return `import {ProgressCheckbox} from "@ui/components/progress-checkbox"\n\nProgressCheckbox(surface, x, y, w, h, {progress: ${args.value}, checked: ${args.checked}${disabled}, onChange: setChecked})`
  if (options.component === "slider-control") return `import {SliderControl} from "@ui/components/slider-control"\n\nSliderControl(surface, x, y, w, {key: "factor", label: ${JSON.stringify(args.label)}, value: ${args.value}, min: 0, max: 1, step: 0.01, onChange: setValue})`
  if (options.component === "typography") return `import {Typography} from "@ui/components/typography"\n\nTypography(surface, x, y, w, h, {children: ${JSON.stringify(args.label)}, variant: "title"})`
  if (options.component === "divider") return `import {Divider} from "@ui/components/divider"\n\nDivider(surface, x, y, width, {children: ${JSON.stringify(args.label)}, variant: ${JSON.stringify(dividerVariant(options.variant))}})`
  if (options.component === "list") return 'import {List} from "@ui/components/list"\n\nList(surface, x, y, w, h, {items, selectedKey: "field"})'
  if (options.component === "table") return 'import {Table} from "@ui/components/table"\n\nTable(surface, x, y, w, h, {columns, rows, getRowId: (row) => row.name})'
  if (options.component === "scrollbar") return `import {scrollbar} from "@ui/elements/scrollbar"\n\nscrollbar(surface, x, y, height, {offset: ${Math.round(args.value * 600)}, visible: 260, total: 860})`
  return [
    "// Noti пока не опубликован в рабочем API.",
    "// Каталог сохраняет явный статус вместо неработающего импорта.",
  ].join("\n")
}

function dividerVariant(variant: string): DividerVariant {
  if (variant === "inset") return "inset"
  if (variant === "middle") return "middle"
  return "fullWidth"
}

function defaultLabel(component: SimpleComponentStory): string {
  if (component === "badge") return "Готово"
  if (component === "slider-control") return "Фактор"
  if (component === "typography") return "Заголовок"
  if (component === "divider") return "Раздел"
  return "Компонент UI"
}
