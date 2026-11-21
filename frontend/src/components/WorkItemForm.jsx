import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { allCategories, useConfig, useEmployees } from '../api/hooks'
import { useAuth } from '../auth'
import DynamicFields from './DynamicFields'
import WorkTypeInput from './WorkTypeInput'
import { darkButton, inputClass, lightButton } from './ui'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const LAST_CATEGORY = 'workhub_last_category'

const readLastCategory = () => {
  try { return Number(localStorage.getItem(LAST_CATEGORY)) || null } catch { return null }
}

// Quick entry form. The category decides which issue list and extra fields appear.
// `presetCategoryId` fixes the category (used by "+ Add Support Call").
export default function WorkItemForm({ onClose, presetCategoryId = null }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const config = useConfig()
  const isManager = user.role !== 'EMPLOYEE'
  const employees = useEmployees(isManager)

  const categories = allCategories(config.data).filter((c) => c.is_active && c.department_active)
  const [categoryId, setCategoryId] = useState(presetCategoryId ?? readLastCategory())
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]

  const blank = { title: '', work_type: '', priority: 'MEDIUM', description: '', due_date: '', assigned_to: '' }
  const [form, setForm] = useState(blank)
  const [custom, setCustom] = useState({})
  const [showMore, setShowMore] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  const [savedNumber, setSavedNumber] = useState('')
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const pickCategory = (id) => {
    setCategoryId(id)
    setForm({ ...form, work_type: '' })
    setCustom({})
    try { localStorage.setItem(LAST_CATEGORY, id) } catch { /* private window: just don't remember */ }
  }

  const save = useMutation({
    mutationFn: () =>
      api.post('/work-items', {
        category_id: category.id,
        title: form.title,
        work_type: form.work_type,
        priority: form.priority,
        description: form.description,
        due_date: form.due_date || null,
        custom_data: custom,
        ...(form.assigned_to ? { assigned_to: Number(form.assigned_to) } : {}),
      }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] })
      queryClient.invalidateQueries({ queryKey: ['config'] }) // a new work type may have been added
      if (addAnother) {
        setForm({ ...blank, priority: form.priority })
        setCustom({})
        setSavedNumber(data.number)
      } else {
        onClose()
      }
    },
  })

  if (config.isLoading) return <div className="mb-6 text-sm text-slate-500">Loading…</div>
  if (!category) return <div className="mb-6 text-sm text-red-600">No active categories. Ask an admin to add one.</div>

  const submit = (another) => (e) => {
    e.preventDefault()
    if (!e.currentTarget.form.reportValidity()) return
    setAddAnother(another)
    setSavedNumber('')
    save.mutate()
  }

  return (
    <form className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Add work</h2>

      {!presetCategoryId && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Category">
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => pickCategory(c.id)} aria-pressed={c.id === category.id}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                c.id === category.id ? 'border-brand bg-brand text-white' : 'border-slate-300 hover:bg-slate-100'
              }`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <label className="mt-4 block text-sm font-medium">
        What did you work on? <span className="text-red-600">*</span>
        <input required autoFocus maxLength={255} value={form.title} onChange={set('title')} className={inputClass}
          placeholder="A task, an issue, a meeting, a session… in your own words" />
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WorkTypeInput category={category} value={form.work_type} onChange={(work_type) => setForm({ ...form, work_type })} />
        <DynamicFields fields={category.custom_fields} values={custom} onChange={setCustom} />
        <label className="block text-sm font-medium">Priority
          <select value={form.priority} onChange={set('priority')} className={inputClass}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
      </div>

      {showMore ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium sm:col-span-2 lg:col-span-3">Description
            <textarea rows={3} value={form.description} onChange={set('description')} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Due date
            <input type="date" value={form.due_date} onChange={set('due_date')} className={inputClass} />
          </label>
          {isManager && (
            <label className="block text-sm font-medium">Assign to
              <select value={form.assigned_to} onChange={set('assigned_to')} className={inputClass}>
                <option value="">Me</option>
                {(employees.data ?? [])
                  .filter((e) => e.is_active && e.id !== user.id && e.department_id === category.department_id)
                  .map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="mt-3 text-sm text-slate-600 underline hover:text-slate-900">
          More: description, due date{isManager ? ', assign to' : ''}
        </button>
      )}

      {save.isError && <p role="alert" className="mt-4 text-sm text-red-600">{errorMessage(save.error)}</p>}
      {savedNumber && !save.isPending && <p className="mt-4 text-sm text-green-700">Saved as {savedNumber}. Add the next one.</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" onClick={submit(false)} disabled={save.isPending} className={darkButton}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={submit(true)} disabled={save.isPending} className={lightButton}>Save and add another</button>
        <button type="button" onClick={onClose} className={lightButton}>Cancel</button>
      </div>
    </form>
  )
}
