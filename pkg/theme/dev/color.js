/**
 * Категории цветов темы
 * @type {string[]}
 */
const colorCategories = ["primary", "secondary", "tertiary", "success", "warning", "error", "surface"]

/**
 * Оттенки для каждой категории цветов
 * @type {number[]}
 */
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

/**
 * Получает RGB значения из CSS переменной
 * @param {string} variableName - Имя CSS переменной
 * @returns {string} RGB значения в формате "R G B"
 */
function getRGBValues(variableName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim()
    .replace(/[^0-9\s]/g, "")
}

/**
 * Создает строку таблицы для цвета
 * @param {string} category - Категория цвета
 * @param {number} shade - Оттенок цвета
 * @returns {Function} HTML-шаблон строки таблицы
 */
function createColorRow(category, shade) {
  const variableName = `--${category}-${shade}`
  const rgbValue = getRGBValues(variableName)
  const hexValue = rgbToHex(rgbValue)
  const backgroundColor = rgbValue ? `rgb(${rgbValue})` : "transparent"

  return html`
    <tr>
      <td>${category}</td>
      <td>${variableName}</td>
      <td>${rgbValue || "N/A"}</td>
      <td>${hexValue}</td>
      <td>
        <div class="color-swatch" style="background-color: ${backgroundColor}"></div>
      </td>
    </tr>
  `
}

/**
 * Конвертирует RGB значения в HEX формат
 * @param {string} rgb - RGB значения в формате "R G B"
 * @returns {string} Цвет в HEX формате (#RRGGBB)
 */
function rgbToHex(rgb) {
  if (!rgb || rgb.trim() === "") return "#NaN"

  const values = rgb.split(/\s+/).filter(Boolean)
  if (values.length !== 3) return "#NaN"

  try {
    return (
      "#" +
      values
        .map(x => {
          const hex = parseInt(x).toString(16)
          return hex.length === 1 ? "0" + hex : hex
        })
        .join("")
    )
  } catch (e) {
    return "#NaN"
  }
}

/**
 * Инициализирует таблицу цветов
 */
function initializeTable() {
  const table = document.getElementById("colors-table")
  if (!table) return
  const tbody = document.createElement("tbody")

  colorCategories.forEach(category => {
    html`
      <tr class="category-header">
        <td colspan="5">${category}</td>
      </tr>
    `(tbody)

    shades.forEach(shade => {
      createColorRow(category, shade)(tbody)
    })
  })

  table.appendChild(tbody)
}

/**
 * Инициализирует поиск по таблице
 */
function initSearch() {
  const searchInput = document.getElementById("search-input")
  if (!searchInput) return
  searchInput.addEventListener("input", e => {
    const { value } = /** @type {HTMLInputElement} */ (e.target)
    const searchTerm = value.toLowerCase()
    const rows = document.querySelectorAll("#colors-table tr:not(.category-header)")

    rows.forEach(
      /** @type {HTMLElement} */ row => {
        const element = /** @type {HTMLElement} */ (row)
        const text = element.textContent?.toLowerCase()
        if (!text) return
        element.style.display = text.includes(searchTerm) ? "" : "none"
      }
    )
  })
}

/**
 * Переключает тему между светлой и тёмной
 */
function toggleTheme() {
  const html = document.documentElement
  const isDark = html.classList.contains("theme-dark")
  const button = document.getElementById("theme-toggle")
  if (!button) return
  if (isDark) {
    html.classList.remove("theme-dark")
    html.classList.add("theme-light")
    button.innerHTML = "🌙 Тёмная тема"
    localStorage.setItem("theme", "light")
  } else {
    html.classList.remove("theme-light")
    html.classList.add("theme-dark")
    button.innerHTML = "☀️ Светлая тема"
    localStorage.setItem("theme", "dark")
  }
}

/**
 * Инициализирует тему из localStorage
 */
function initTheme() {
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const savedTheme = localStorage.getItem('theme') || systemTheme;
  const html = document.documentElement;
  const button = document.getElementById('theme-toggle');
  
  if (!button) return;
  
  html.classList.remove('theme-light', 'theme-dark');
  html.classList.add(`theme-${savedTheme}`);
  
  button.innerHTML = savedTheme === 'dark' 
      ? '☀️ Светлая тема' 
      : '🌙 Тёмная тема';
}

/**
 * Инициализирует все компоненты страницы
 */
function init() {
  initializeTable()
  initSearch()
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme)
  initTheme()
}

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", init)
