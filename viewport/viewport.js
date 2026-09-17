import "./components/grid.js"
import { MetaFor } from "../metafor.js"
import { when } from "../html.js"

MetaFor("viewport")
  .states("IDLE")
  .context(({ boolean }) => ({
    grid: boolean({ title: "Показывать сетку", default: true }),
    showAxis: boolean({ title: "Показывать оси", default: true }),
  }))
  .transitions([])
  .core()
  .actions({})
  .view({
    onMount: ({ component }) => {
      console.log("mount", component)
      console.log(component.shadowRoot?.querySelector("slot")?.assignedElements())
    },
    render: ({html, context, update}) => html`
      <button @click=${() => update({grid: !context.grid})}>
        ${context.grid ? "hide" : "show"} grid
      </button>
      <button @click=${() => update({showAxis: !context.showAxis})}>
        ${context.showAxis ? "hide" : "show"} axis
      </button>
      <div class="viewport-content">
        <slot></slot>
      </div>
      ${when(context.grid, () => html`
        <metafor-grid ?show-axis=${context.showAxis} />
      `)}
      <style>
        :host {
          --metafor-grid-size: 50;
          --metafor-grid-color: rgba(49, 49, 49, 0.325);
          --metafor-grid-line-width: 1;
          --metafor-grid-main-color: rgba(119, 118, 119, 0.1);
          --metafor-grid-main-line-width: 2;
        }
      </style>
    `, //prettier-ignore
    style: ({ css }) => css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        user-select: none;
        touch-action: none;
        -webkit-touch-callout: none;
        opacity: 1;
        transition: opacity 0.22s ease;
        overscroll-behavior: none;
        -webkit-overscroll-behavior: none;

        *,
        .viewport-content {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }
      }
    `,
  })
  .create({
    state: "IDLE",
  })
