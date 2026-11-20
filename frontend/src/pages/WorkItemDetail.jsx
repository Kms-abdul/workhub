import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { activityText, allCategories, formatDateTime, formatMinutes, useConfig, useEmployees } from '../api/hooks'
import { useAuth } from '../auth'
import DynamicFields from '../components/DynamicFields'
import WorkTypeInput from '../components/WorkTypeInput'
import { StatusBadge, darkButton, inputClass, lightButton } from '../components/ui'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

function Card({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

// Edit form. Mounted once the item is loaded, so its state starts from the saved values.
function EditForm({ item, category, onSaved }) {
  const { user } = useAuth()
  const isManager = user.role !== 'EMPLOYEE'
  const employees = useEmployees(isManager)
  const [form, setForm] = useState({
    title: item.title,
    description: item.description ?? '',
    status_id: item.status.id,
    priority: item.priority,
    work_type: item.classification?.name ?? '',
    due_date: item.due_date?.slice(0, 10) ?? '',
    assigned_to: item.assigned_to?.id ?? '',
  })
  const [custom, setCustom] = useState(item.custom_data)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/work-items/${item.id}`, {
        title: form.title,
        description: form.description,
        status_id: Number(form.status_id),
        priority: form.priority,
        work_type: form.work_type,
        due_date: form.due_date || null,
        custom_data: custom,
        ...(isManager ? { assigned_to: form.assigned_to ? Number(form.assigned_to) : null } : {}),
      }),
    onSuccess: onSaved,
  })

  const statuses = category?.statuses ?? [item.status]

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <label className="block text-sm font-medium">Work done
        <input required maxLength={255} value={form.title} onChange={set('title')} className={inputClass} />
      </label>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm font-medium">Status
          <select value={form.status_id} onChange={set('status_id')} className={inputClass}>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Priority
          <select value={form.priority} onChange={set('priority')} className={inputClass}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        <WorkTypeInput category={category} value={form.work_type} onChange={(work_type) => setForm({ ...form, work_type })} />
        <DynamicFields fields={category?.custom_fields ?? []} values={custom} onChange={setCustom} />
        <label className="block text-sm font-medium">Due date
          <input type="date" value={form.due_date} onChange={set('due_date')} className={inputClass} />
        </label>
        {isManager && (
          <label className="block text-sm font-medium">Assigned to
            <select value={form.assigned_to} onChange={set('assigned_to')} className={inputClass}>
              <option value="">Nobody</option>
              {(employees.data ?? [])
                .filter((e) => e.is_active || e.id === item.assigned_to?.id)
                .map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="mt-4 block text-sm font-medium">Description
        <textarea rows={3} value={form.description} onChange={set('description')} className={inputClass} />
      </label>

      {save.isError && <p role="alert" className="mt-4 text-sm text-red-600">{errorMessage(save.error)}</p>}
      {save.isSuccess && <p className="mt-4 text-sm text-green-700">Saved.</p>}
      <button type="submit" disabled={save.isPending} className={`${darkButton} mt-4`}>
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

function TimeEntries({ item, onChanged }) {
  const { user } = useAuth()
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0)

  const change = useMutation({ mutationFn: (request) => api(request), onSuccess: onChanged })
  const add = (e) => {
    e.preventDefault()
    change.mutate({ method: 'post', url: `/work-items/${item.id}/time`, data: { minutes: total, note } },
      { onSuccess: () => { setHours(''); setMinutes(''); setNote('') } })
  }
  const box = 'w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm'

  return (
    <Card title={`Time — ${formatMinutes(item.total_minutes)} total`}>
      {item.time_entries.length === 0 && <p className="text-sm text-slate-500">No time logged yet.</p>}
      <ul className="divide-y divide-slate-100 text-sm">
        {item.time_entries.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="w-16 font-medium">{t.ended_at ? formatMinutes(t.minutes) : 'Running'}</span>
            <span className="text-slate-600">{t.employee}</span>
            <span className="text-slate-500">{formatDateTime(t.started_at)} · {t.entry_type === 'TIMER' ? 'timer' : 'manual'}</span>
            {t.note && <span className="min-w-0 flex-1 text-slate-600">“{t.note}”</span>}
            {t.ended_at && (user.role !== 'EMPLOYEE' || t.employee === user.name) && (
              <button type="button" disabled={change.isPending} className="ml-auto text-xs text-red-600 underline"
                onClick={() => window.confirm(`Remove this ${formatMinutes(t.minutes)} entry?`) &&
                  change.mutate({ method: 'delete', url: `/time-entries/${t.id}` })}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Add time:</span>
        <input type="number" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} className={box} aria-label="Hours" />
        <span>h</span>
        <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={box} aria-label="Minutes" />
        <span>m</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <button type="submit" disabled={total < 1 || change.isPending} className={`${lightButton} !py-1.5`}>Add</button>
      </form>
      {change.isError && <p role="alert" className="mt-2 text-sm text-red-600">{errorMessage(change.error)}</p>}
    </Card>
  )
}

export default function WorkItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useConfig()

  const query = useQuery({
    queryKey: ['work-items', 'detail', id],
    queryFn: () => api.get(`/work-items/${id}`).then((r) => r.data),
    retry: false,
  })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['work-items'] })
    queryClient.invalidateQueries({ queryKey: ['config'] }) // a new work type may have been added
  }

  if (query.isLoading || config.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (query.isError) return <p role="alert" className="text-sm text-red-600">{errorMessage(query.error)}</p>

  const item = query.data
  const category = allCategories(config.data).find((c) => c.id === item.category.id)

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-slate-600 underline hover:text-slate-900">← Back</button>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{item.number}</h1>
        <StatusBadge status={item.status} />
        <span className="text-sm text-slate-500">{item.category.name}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Created by {item.created_by.name} on {formatDateTime(item.created_at)}
        {item.completed_at && ` · finished ${formatDateTime(item.completed_at)}`}
      </p>

      <div className="mt-6 space-y-6">
        <Card title="Details">
          {/* updated_at in the key reloads the form with fresh values after any change */}
          <EditForm key={item.updated_at} item={item} category={category} onSaved={refresh} />
        </Card>

        <TimeEntries item={item} onChanged={refresh} />

        <Card title="History">
          <ul className="space-y-2 text-sm">
            {[...item.activity].reverse().map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2">
                <span className="w-40 shrink-0 text-slate-500">{formatDateTime(a.created_at)}</span>
                <span><span className="font-medium">{a.employee}</span> {activityText(a)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
