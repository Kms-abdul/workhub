import { useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { allCategories, categoryWorkTypes, useConfig } from '../api/hooks'

const LAST_CATEGORY = 'workhub_last_category'
const box = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none'
const HTML_TYPE = { TEXT: 'text', NUMBER: 'number', DATE: 'date' }

// "1:30", "1h 30m", "1.5h", "90m" or "90" (minutes) -> minutes. '' -> 0. Not understood -> null.
export function parseDuration(text) {
  const t = text.trim().toLowerCase()
  if (!t) return 0
  let m = t.match(/^(\d{1,2}):([0-5]?\d)$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = t.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2})\s*m?)?$/)
  if (m) return Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0)
  m = t.match(/^(\d+)\s*m?$/)
  if (m) return Number(m[1])
  return null
}

function Field({ label, width, children }) {
  return (
    <label className={`block text-xs font-semibold uppercase text-slate-500 ${width}`}>
      {label}
      {children}
    </label>
  )
}

// One-line entry, like a row in the Daily Task sheet:
// Date | Category | Work type | (the category's own fields) | Description | Status | Time | Comments.
// Fill it in, press Enter, and the row is cleared for the next one.
export default function QuickLog({ day, onDayChange, today }) {
  const queryClient = useQueryClient()
  const listId = useId()
  const firstBox = useRef(null)
  const config = useConfig()
  const categories = allCategories(config.data).filter((c) => c.is_active && c.department_active)

  const [categoryId, setCategoryId] = useState(() => {
    try { return Number(localStorage.getItem(LAST_CATEGORY)) || null } catch { return null }
  })
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]
  const severalDepartments = new Set(categories.map((c) => c.department_id)).size > 1
  // Suggestions are only the work types already used in the chosen category:
  // "Testing" typed under Development is not offered under Quick Solutions.
  const workTypes = categoryWorkTypes(category)
  const blank = { work_type: '', title: '', status_id: '', time: '', comments: '' }
  const [row, setRow] = useState(blank)
  const [custom, setCustom] = useState({})
  const [saved, setSaved] = useState('')
  const set = (field) => (e) => setRow({ ...row, [field]: e.target.value })

  const pickCategory = (e) => {
    const id = Number(e.target.value)
    setCategoryId(id)
    setRow({ ...row, status_id: '' })
    setCustom({})
    try { localStorage.setItem(LAST_CATEGORY, id) } catch { /* private window: just don't remember */ }
  }

  // A log line is usually something already done, so "finished" is the default status.
  const statuses = category?.statuses ?? []
  const defaultStatus = statuses.find((s) => s.kind === 'DONE') ?? statuses.find((s) => s.is_initial) ?? statuses[0]
  const minutes = parseDuration(row.time)

  const save = useMutation({
    mutationFn: () =>
      api.post('/work-items', {
        category_id: category.id,
        title: row.title,
        work_type: row.work_type,
        status_id: Number(row.status_id) || defaultStatus?.id,
        minutes,
        work_date: day,
        description: row.comments,
        custom_data: custom,
      }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] })
      queryClient.invalidateQueries({ queryKey: ['config'] }) // a new work type may have been added
      setSaved(data.number)
      setRow({ ...blank, status_id: row.status_id })
      setCustom({})
      firstBox.current?.focus()
    },
  })

  if (config.isLoading) return null
  if (!category) return <p className="mt-6 text-sm text-red-600">No active categories. Ask an admin to add one.</p>

  const submit = (e) => {
    e.preventDefault()
    setSaved('')
    if (minutes !== null) save.mutate()
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" width="w-36">
          <input type="date" required value={day} max={today} onChange={(e) => e.target.value && onDayChange(e.target.value)} className={box} />
        </Field>
        <Field label="Category" width="w-44">
          <select value={category.id} onChange={pickCategory} className={box}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{severalDepartments ? `${c.name} (${c.department_name})` : c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Work type" width="w-40">
          <input ref={firstBox} list={listId} value={row.work_type} onChange={set('work_type')} maxLength={150}
            autoComplete="off" placeholder="e.g. Meeting" className={box} />
          <datalist id={listId}>{workTypes.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        {category.custom_fields.map((f) => (
          <Field key={f.id} label={f.label + (f.is_required ? ' *' : '')} width="w-36">
            {f.field_type === 'SELECT' ? (
              <select required={f.is_required} value={custom[f.field_key] ?? ''} className={box}
                onChange={(e) => setCustom({ ...custom, [f.field_key]: e.target.value })}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input type={HTML_TYPE[f.field_type]} required={f.is_required} value={custom[f.field_key] ?? ''} className={box}
                onChange={(e) => setCustom({ ...custom, [f.field_key]: e.target.value })} />
            )}
          </Field>
        ))}
        <Field label="What did you do *" width="min-w-64 flex-1">
          <input required maxLength={255} value={row.title} onChange={set('title')} className={box}
            placeholder="A task, an issue, a call, a meeting…" />
        </Field>
        <Field label="Status" width="w-40">
          <select value={row.status_id || defaultStatus?.id || ''} onChange={set('status_id')} className={box}>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Time (h:mm)" width="w-24">
          <input value={row.time} onChange={set('time')} placeholder="0:30" inputMode="numeric" aria-invalid={minutes === null}
            className={`${box} ${minutes === null ? 'border-red-500' : ''}`} />
        </Field>
        <Field label="Comments" width="min-w-48 flex-1">
          <input value={row.comments} onChange={set('comments')} className={box} />
        </Field>
        <button type="submit" disabled={save.isPending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
          {save.isPending ? 'Saving…' : 'Add'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Press Enter to add the row. Time can be typed as 0:30, 1:15, 45m or 1.5h.
        {minutes === null && <span className="ml-2 text-red-600">Time is not understood. Try 0:30 or 45m.</span>}
        {save.isError && <span role="alert" className="ml-2 text-red-600">{errorMessage(save.error)}</span>}
        {saved && !save.isPending && <span className="ml-2 text-green-700">Saved as {saved}. Type the next one.</span>}
      </p>
    </form>
  )
}
