import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { allCategories, formatDateTime, formatMinutes, useConfig, useEmployees } from '../api/hooks'
import { useAuth } from '../auth'
import { StatusBadge, lightButton } from '../components/ui'
import { WorkTypeFilter } from '../components/WorkTypeInput'

const TABS = [
  ['daily', 'Daily report'],
  ['summary', 'Employees and categories'],
  ['category', 'Category in depth'],
]
const filterInput = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none'

// Local date as YYYY-MM-DD (toISOString would give the UTC date, which can be yesterday).
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => isoDate(new Date())
const monthStart = () => { const d = new Date(); d.setDate(1); return isoDate(d) }

function useReport(path, params, enabled = true) {
  return useQuery({
    queryKey: ['work-items', 'report', path, params],
    queryFn: () => api.get(`/reports/${path}`, { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
    enabled,
  })
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function Card({ title, hint, children }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      <div className="mt-3 overflow-x-auto">{children}</div>
    </section>
  )
}

// columns: [header, cell(row), align-right?]
function Table({ columns, rows, empty = 'Nothing in this period.', footer }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">{empty}</p>
  const cell = (right) => `px-3 py-2 first:pl-0 last:pr-0 ${right ? 'text-right' : ''}`
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
        <tr>{columns.map(([header, , right]) => <th key={header} className={cell(right)}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? row.name ?? row.value ?? i} className="border-b border-slate-100 align-top last:border-0">
            {columns.map(([header, render, right]) => <td key={header} className={cell(right)}>{render(row)}</td>)}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot className="border-t border-slate-300 font-semibold">
          <tr>{columns.map(([header, render, right], i) => (
            <td key={header} className={cell(right)}>{i === 0 ? 'Total' : render(footer)}</td>
          ))}</tr>
        </tfoot>
      )}
    </table>
  )
}

const COUNT_COLUMNS = (first) => [
  [first, (r) => <span className="font-medium">{r.name}</span>],
  ['Logged', (r) => r.created, true],
  ['Finished', (r) => r.finished, true],
  ['Time', (r) => formatMinutes(r.minutes), true],
]
const itemLink = (i) => <Link to={`/work/${i.id}`} className="font-medium text-blue-700 hover:underline">{i.number}</Link>

function ReportState({ query, children }) {
  if (query.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (query.isError) return <p role="alert" className="text-sm text-red-600">{errorMessage(query.error)}</p>
  if (!query.data) return null
  return <div className="space-y-6">{children(query.data)}</div>
}

function Summaries({ data }) {
  return (
    <>
      <Card title="By work type" hint="Time spent on each kind of work, such as meetings, across all categories.">
        <Table columns={COUNT_COLUMNS('Work type')} rows={data.by_work_type} footer={data.totals} />
      </Card>
      <Card title="By category"><Table columns={COUNT_COLUMNS('Category')} rows={data.by_category} footer={data.totals} /></Card>
      <Card title="By employee" hint="Logged = work they entered. Finished = work assigned to them that was finished. Time = time they logged.">
        <Table columns={COUNT_COLUMNS('Employee')} rows={data.by_employee} footer={data.totals} />
      </Card>
    </>
  )
}

function Daily({ filters, setFilter, isManager }) {
  const employees = useEmployees(isManager)
  const date = filters.date || today()
  const query = useReport('daily', { date, employee_id: filters.employee_id || undefined, work_type: filters.work_type || undefined })
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input type="date" value={date} max={today()} onChange={(e) => setFilter('date', e.target.value)} className={filterInput} aria-label="Date" />
        {isManager && (
          <select value={filters.employee_id ?? ''} onChange={(e) => setFilter('employee_id', e.target.value)} className={filterInput} aria-label="Employee">
            <option value="">Everyone</option>
            {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <WorkTypeFilter value={filters.work_type ?? ''} onChange={(v) => setFilter('work_type', v)} className={filterInput} />
      </div>
      <ReportState query={query}>
        {(data) => (
          <>
            <p className="text-sm font-medium">
              {formatDateTime(data.date, false)}{filters.work_type && ` · only “${filters.work_type}”`}
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Tile label="Work logged" value={data.totals.created} />
              <Tile label="Work finished" value={data.totals.finished} />
              <Tile label="Time logged" value={formatMinutes(data.totals.minutes)} />
              <Tile label="Employees active" value={data.employees_active} />
            </div>
            <Summaries data={data} />
            <Card title={`Work touched this day (${data.items.length})`} hint="Logged, finished, or had time added on this day.">
              <Table rows={data.items} empty="No work was logged, finished or timed on this day." columns={[
                ['No.', itemLink],
                ['Work', (i) => i.title],
                ['Category', (i) => i.category],
                ['Work type', (i) => i.work_type ?? '—'],
                ['Assigned', (i) => i.assigned_to ?? '—'],
                ['This day', (i) => [i.created_today && 'logged', i.finished_today && 'finished'].filter(Boolean).join(', ') || 'worked on'],
                ['Status now', (i) => <StatusBadge status={i.status} />],
                ['Time this day', (i) => formatMinutes(i.minutes), true],
              ]} />
            </Card>
          </>
        )}
      </ReportState>
    </>
  )
}

function PeriodInputs({ from, to, setFilter }) {
  return (
    <>
      <label className="text-sm text-slate-600">From{' '}
        <input type="date" value={from} max={to} onChange={(e) => setFilter('from', e.target.value)} className={filterInput} />
      </label>
      <label className="text-sm text-slate-600">To{' '}
        <input type="date" value={to} min={from} max={today()} onChange={(e) => setFilter('to', e.target.value)} className={filterInput} />
      </label>
    </>
  )
}

function Summary({ filters, setFilter }) {
  const from = filters.from || monthStart()
  const to = filters.to || today()
  const query = useReport('summary', { from, to, work_type: filters.work_type || undefined })
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PeriodInputs from={from} to={to} setFilter={setFilter} />
        <WorkTypeFilter value={filters.work_type ?? ''} onChange={(v) => setFilter('work_type', v)} className={filterInput} />
      </div>
      <ReportState query={query}>
        {(data) => (
          <>
            <p className="text-sm font-medium">
              {formatDateTime(data.from, false)} to {formatDateTime(data.to, false)}{filters.work_type && ` · only “${filters.work_type}”`}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Tile label="Work logged" value={data.totals.created} />
              <Tile label="Work finished" value={data.totals.finished} />
              <Tile label="Time logged" value={formatMinutes(data.totals.minutes)} />
            </div>
            <Summaries data={data} />
          </>
        )}
      </ReportState>
    </>
  )
}

function CategoryReport({ filters, setFilter }) {
  const config = useConfig()
  const categories = allCategories(config.data).filter((c) => c.is_active)
  const from = filters.from || monthStart()
  const to = filters.to || today()
  const categoryId = filters.category_id || ''
  const query = useReport('category', { category_id: categoryId, from, to, q: filters.q || undefined }, !!categoryId)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={categoryId} onChange={(e) => setFilter('category_id', e.target.value)} className={filterInput} aria-label="Category">
          <option value="">Choose a category…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <PeriodInputs from={from} to={to} setFilter={setFilter} />
        <input type="search" placeholder="Search text, e.g. fee or a branch" value={filters.q ?? ''}
          onChange={(e) => setFilter('q', e.target.value)} className={`${filterInput} w-64`} />
      </div>
      {!categoryId && <p className="text-sm text-slate-500">Choose a category to see its work by status, person and its own fields. Pick Quick Solutions for the support call report.</p>}
      {categoryId && (
        <ReportState query={query}>
          {(data) => (
            <>
              <p className="text-sm font-medium">
                {data.category.name} · work logged {formatDateTime(data.from, false)} to {formatDateTime(data.to, false)}
                {filters.q && ` · containing “${filters.q}”`}
              </p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Tile label="Logged" value={data.totals.created} />
                <Tile label="Finished" value={data.totals.finished} />
                <Tile label="Still open" value={data.totals.open} />
                <Tile label="Finished rate" value={data.totals.finished_percent === null ? '—' : `${data.totals.finished_percent}%`} />
                <Tile label="Average time to finish" value={data.totals.average_minutes_to_finish === 0 ? 'under 1m' : formatMinutes(data.totals.average_minutes_to_finish)} />
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card title="By status">
                  <Table rows={data.by_status} columns={[
                    ['Status', (s) => <StatusBadge status={s} />],
                    ['Count', (s) => s.count, true],
                  ]} />
                </Card>
                <Card title="By employee">
                  <Table rows={data.by_employee} columns={[
                    ['Assigned to', (e) => <span className="font-medium">{e.name}</span>],
                    ['Work', (e) => e.count, true],
                    ['Finished', (e) => e.finished, true],
                  ]} />
                </Card>
                {data.by_field.map((field) => (
                  <Card key={field.label} title={`Most common: ${field.label}`}
                    hint={field.distinct > field.values.length ? `Top ${field.values.length} of ${field.distinct} different values.` : undefined}>
                    <Table rows={field.values} columns={[
                      [field.label, (v) => <span className="font-medium">{v.value}</span>],
                      ['Count', (v) => v.count, true],
                    ]} />
                  </Card>
                ))}
              </div>
              <Card title={`Work items (${data.totals.created})`} hint={data.totals.created > data.items.length ? `Showing the newest ${data.items.length}.` : undefined}>
                <Table rows={data.items} columns={[
                  ['No.', itemLink],
                  ['Work', (i) => i.title],
                  ...data.fields.map((f) => [f.label, (i) => i.custom_data[f.key] ?? '—']),
                  ['Assigned', (i) => i.assigned_to ?? '—'],
                  ['Status', (i) => <StatusBadge status={i.status} />],
                  ['Time', (i) => formatMinutes(i.minutes), true],
                  ['Logged on', (i) => formatDateTime(i.created_at)],
                ]} />
              </Card>
            </>
          )}
        </ReportState>
      )}
    </>
  )
}

export default function Reports() {
  const { user } = useAuth()
  const isManager = user.role !== 'EMPLOYEE'
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(params)
  const tab = TABS.some(([key]) => key === filters.tab) ? filters.tab : 'daily'
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isManager ? 'Built from the work and time your team entered.' : 'Built from your own work and time.'}
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className={`${lightButton} print:hidden`}>Print</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 print:hidden" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key }, { replace: true })}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              tab === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-6">
        {tab === 'daily' && <Daily filters={filters} setFilter={setFilter} isManager={isManager} />}
        {tab === 'summary' && <Summary filters={filters} setFilter={setFilter} />}
        {tab === 'category' && <CategoryReport filters={filters} setFilter={setFilter} />}
      </div>
    </div>
  )
}
