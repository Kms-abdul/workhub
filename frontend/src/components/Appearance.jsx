import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { applyTheme } from '../theme'

const FIELDS = [
  ['brand', 'Main colour', 'Buttons, links, selected menu item'],
  ['accent', 'Accent colour', 'Edge of the selected menu item, line under WorkHub'],
  ['sidebar', 'Sidebar background', 'The menu on the left'],
  ['sidebar_text', 'Sidebar text', 'Menu text, name and role'],
]
const isHex = (value) => /^#[0-9a-fA-F]{6}$/.test(value)

// Standard readability measure (WCAG contrast ratio): 1 = same colour, 21 = black on white.
// Normal text should be at least 4.5.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Colour pickers for the whole app. Moving a picker previews the colour on this screen at once;
// Save makes it the look for everyone.
export default function Appearance() {
  const queryClient = useQueryClient()
  const theme = useQuery({ queryKey: ['theme'], queryFn: () => api.get('/theme').then((r) => r.data) })
  const [colors, setColors] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { if (theme.data && !colors) setColors(theme.data.colors) }, [theme.data, colors])

  const save = useMutation({
    mutationFn: (body) => api.put('/theme', body).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['theme'], data)
      setColors(data.colors)
      applyTheme(data.colors)
    },
  })

  if (!colors) return null
  const saved = theme.data.colors
  const changed = FIELDS.some(([key]) => colors[key].toLowerCase() !== saved[key].toLowerCase())
  const allValid = FIELDS.every(([key]) => isHex(colors[key]))

  const pick = (key, value) => {
    const next = { ...colors, [key]: value }
    setColors(next)
    if (isHex(value)) applyTheme(next) // live preview
  }
  const cancel = () => { setColors(saved); applyTheme(saved) }

  // Warn when the menu would be hard to read, and offer the readable choice (white or near-black).
  const hardToRead = allValid && contrast(colors.sidebar, colors.sidebar_text) < 4.5
  const readableText = allValid && contrast(colors.sidebar, '#ffffff') >= contrast(colors.sidebar, '#1e293b') ? '#ffffff' : '#1e293b'
  const whiteOnBrandIsWeak = allValid && contrast(colors.brand, '#ffffff') < 4.5

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="font-semibold">Appearance</span>
          <span className="ml-2 text-sm text-slate-500">Colours of the app, for everyone</span>
        </span>
        <span className="flex items-center gap-1.5">
          {FIELDS.map(([key]) => (
            <span key={key} className="h-5 w-5 rounded-full border border-slate-300" style={{ backgroundColor: saved[key] }} />
          ))}
          <span className="ml-2 text-sm text-slate-500">{open ? 'Hide' : 'Change'}</span>
        </span>
      </button>

      {open && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {FIELDS.map(([key, label, hint]) => (
              <label key={key} className="block text-sm font-medium">
                {label}
                <span className="mt-1 flex items-center gap-2">
                  <input type="color" value={isHex(colors[key]) ? colors[key] : saved[key]} onChange={(e) => pick(key, e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-white p-1" aria-label={`${label} picker`} />
                  <input value={colors[key]} onChange={(e) => pick(key, e.target.value.trim())} maxLength={7} spellCheck={false}
                    aria-label={`${label} code`} aria-invalid={!isHex(colors[key])}
                    className={`w-28 rounded-md border px-2 py-2 font-mono text-sm ${isHex(colors[key]) ? 'border-slate-300' : 'border-red-500'}`} />
                </span>
                <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>
              </label>
            ))}
          </div>

          {hardToRead && (
            <p role="alert" className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The menu text is hard to read on this sidebar background.{' '}
              <button type="button" onClick={() => pick('sidebar_text', readableText)} className="font-medium underline">
                Use {readableText === '#ffffff' ? 'white' : 'dark'} text
              </button>
            </p>
          )}
          {whiteOnBrandIsWeak && (
            <p role="alert" className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The main colour is light, so the white text on buttons will be hard to read. Pick a darker shade.
            </p>
          )}
          <p className="mt-4 text-sm text-slate-500">
            You are seeing a preview on this screen. Nobody else sees it until you save.
          </p>
          {save.isError && <p role="alert" className="mt-2 text-sm text-red-600">{errorMessage(save.error)}</p>}
          {save.isSuccess && !changed && <p className="mt-2 text-sm text-green-700">Saved. Others see it when they reload the page.</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!changed || !allValid || save.isPending} onClick={() => save.mutate(colors)}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
              {save.isPending ? 'Saving…' : 'Save for everyone'}
            </button>
            <button type="button" disabled={!changed} onClick={cancel}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60">
              Undo changes
            </button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate({ reset: true })}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60">
              Back to default colours
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
