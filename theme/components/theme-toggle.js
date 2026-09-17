customElements.define(
  "q-theme-toggle",
  class extends HTMLElement {
    constructor() {
      super()
      this.classList.add("backdrop")

      const storeTheme = localStorage.getItem("theme") || this.getPreferredTheme()
      this.applyTheme(storeTheme)

      this.select = /**@type {HTMLSelectElement} */ (
        html`
          <select>
            <option value="light" ${storeTheme === "light" ? "selected" : ""}>☀️ Светлая тема</option>
            <option value="dark" ${storeTheme === "dark" ? "selected" : ""}>🌙 Тёмная тема</option>
            <option value="xr" ${storeTheme === "xr" ? "selected" : ""}>🥽 XR тема</option>
          </select>
        `(this)
      )
    }

    connectedCallback() {
      this.select.addEventListener("change", () => this.handleThemeChange())
    }

    getPreferredTheme() {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark"
      }
      return "light"
    }

    /**
     * Применяет выбранную тему
     * @param {string} theme - Название темы
     */
    applyTheme(theme) {
      const html = document.documentElement

      // Удаляем все классы тем
      html.classList.remove("theme-dark", "theme-light", "theme-xr")

      // Добавляем класс выбранной темы
      html.classList.add(`theme-${theme}`)

      // Сохраняем в localStorage
      localStorage.setItem("theme", theme)
    }

    /**
     * Обработчик изменения темы
     */
    handleThemeChange() {
      const selectedTheme = this.select.value
      this.applyTheme(selectedTheme)
    }
  }
)

css`
  q-theme-toggle {
    z-index: 1000;
    min-width: 140px;
    position: fixed;
    top: 1rem;
    right: 1rem;
    border-radius: var(--border-radius);

    select {
      --background-color: white;
      .theme-xr &,
      .theme-dark & {
        --background-color: rgba(var(--surface-500) / var(--background-alpha));
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      }
      .theme-light & {
        --background-color: rgba(var(--surface-50) / var(--background-alpha));
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
        &:hover {
          background-color: rgba(var(--surface-100) / var(--background-alpha));
        }
      }
      width: 100%;
      border: none;
      padding: 0.5rem;
      border-radius: inherit;
      background-color: var(--background-color);
      color: inherit;
      font-size: 0.875rem;
      transition: all 0.2s ease;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      
      background-repeat: no-repeat;
      background-position: right 0.5rem center;
      background-size: 1em;
      padding-right: 2rem;

      &:hover {
        background-color: rgba(var(--surface-500) / var(--background-alpha));
      }

      &:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(var(--primary-500) / 0.5);
      }
    }
  }
`
