import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { allCategories, formatDateTime, formatMinutes, useConfig, useEmployees } from '../api/hooks'
import { useAuth } from '../auth'
import { WorkTypeFilter } from '../components/WorkTypeInput'
import { Priority, StatusBadge } from '../components/ui'

const filterInput = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none'
const KINDS = [['', 'Any status'], ['OPEN', 'Open'], ['ACTIVE', 'In progress'], ['DONE', 'Finished']]

export default function AllWork() {
  const { user } = useAuth()
  const isManager = user.role !== 'EMPLOYEE'
  // Filters live in the address bar, so a filtered view can be bookmarked and survives going back.
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(params)
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const config = useConfig()
  const employees = useEmployees(isManager)
  const categories = allCategories(config.data)
  const category = categories.find((c) => String(c.id) === filters.category_id)

  const work = useQuery({
    queryKey: ['work-items', 'all', filters],
    queryFn: () => api.get('/work-items', { params: filters }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })
  const items = work.data ?? []
  const totalMinutes = items.reduce((sum, i) => sum + i.total_minutes, 0)
  // With one category chosen, its own fields (Branch, Caller, Resolution…) become columns.
  const extraColumns = category?.custom_fields ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{category ? category.name : 'All Work'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} item{items.length === 1 ? '' : 's'}
            {totalMinutes > 0 && ` · ${formatMinutes(totalMinutes)} spent in total`}
            {items.length === 500 && ' (showing the newest 500 — narrow the filters to see older work)'}
            {!isManager && ' · work you created or are assigned to'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Category">
        {[{ id: '', name: 'All' }, ...categories.filter((c) => c.is_active)].map((c) => {
          const active = String(c.id) === (filters.category_id ?? '')
          return (
            <button key={c.id} type="button" aria-pressed={active}
              onClick={() => setFilter('category_id', String(c.id))}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                active ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
              }`}>
              {c.name}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Search number or text" value={filters.q ?? ''}
          onChange={(e) => setFilter('q', e.target.value)} className={`${filterInput} w-56`} />
        <WorkTypeFilter category={category} value={filters.work_type ?? ''} onChange={(v) => setFilter('work_type', v)} className={filterInput} />
        <select value={filters.status_kind ?? ''} onChange={(e) => setFilter('status_kind', e.target.value)}
          className={filterInput} aria-label="Status">
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {isManager && (
          <select value={filters.assigned_to ?? ''} onChange={(e) => setFilter('assigned_to', e.target.value)}
            className={filterInput} aria-label="Assigned to">
            <option value="">Anyone</option>
            {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <label className="text-sm text-slate-600">From{' '}
          <input type="date" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} className={filterInput} />
        </label>
        <label className="text-sm text-slate-600">To{' '}
          <input type="date" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} className={filterInput} />
        </label>
        {params.size > 0 && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="text-sm text-slate-600 underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-6" />

      {work.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(work.error)}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Work</th>
              {extraColumns.map((f) => <th key={f.id} className="px-4 py-2">{f.label}</th>)}
              <th className="px-4 py-2">Assigned</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link to={`/work/${item.id}`} className="font-medium text-brand hover:underline">{item.number}</Link>
                </td>
                <td className="min-w-64 max-w-md px-4 py-3">
                  <Link to={`/work/${item.id}`} className="font-medium hover:underline">{item.title}</Link>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[!category && item.category.name, item.classification?.name].filter(Boolean).join(' · ')}
                  </div>
                </td>
                {extraColumns.map((f) => (
                  <td key={f.id} className="max-w-xs px-4 py-3 text-slate-700">{item.custom_data[f.field_key] ?? '—'}</td>
                ))}
                <td className="whitespace-nowrap px-4 py-3">{item.assigned_to?.name ?? '—'}</td>
                <td className="px-4 py-3"><Priority value={item.priority} /></td>
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatMinutes(item.total_minutes)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(item.created_at)}</td>
              </tr>
            ))}
            {!work.isLoading && items.length === 0 && (
              <tr><td colSpan={7 + extraColumns.length} className="px-4 py-6 text-slate-500">No work matches these filters.</td></tr>
            )}
            {work.isLoading && (
              <tr><td colSpan={7 + extraColumns.length} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
