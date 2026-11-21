import api from './api/client'

// API name -> CSS variable defined in index.css.
const CSS_VARIABLE = {
  brand: '--color-brand',
  accent: '--color-accent',
  sidebar: '--color-sidebar',
  sidebar_text: '--color-sidebar-text',
}

// Puts the colours on the page. Everything using bg-brand, text-brand, etc. follows at once.
export function applyTheme(colors) {
  for (const [key, variable] of Object.entries(CSS_VARIABLE)) {
    if (colors?.[key]) document.documentElement.style.setProperty(variable, colors[key])
  }
}

// Called once when the app starts. If it fails, the default colours in index.css stay.
export function loadTheme() {
  return api.get('/theme').then((r) => applyTheme(r.data.colors)).catch(() => {})
}
