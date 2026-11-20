import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api, { errorMessage } from '../api/client'
import { activityText, formatDateTime, formatMinutes } from '../api/hooks'
import { useAuth } from '../auth'

// Chart colours, checked for colour-blind separation and contrast on a white card.
const SERIES = [
  { key: 'open', label: 'To do', color: '#d97706' },
  { key: 'active', label: 'In progress', color: '#2563eb' },
  { key: 'done', label: 'Finished today', color: '#16a34a' },
]
const HOURS_COLOR = '#2563eb'
const axisTick = { fontSize: 12, fill: '#475569' }
const hours = (minutes) => Math.round((minutes / 60) * 10) / 10

function Tile({ label, value, note, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  )
}

function Card({ title, hint, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

// Same numbers as the chart, readable without colour and to the exact figure.
function CountTable({ rows, firstColumn }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-4">{firstColumn}</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">To do</th>
            <th className="px-3 py-2 text-right">In progress</th>
            <th className="px-3 py-2 text-right">Finished</th>
            <th className="py-2 pl-3 text-right">Time today</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-right">{r.total}</td>
              <td className="px-3 py-2 text-right">{r.open}</td>
              <td className="px-3 py-2 text-right">{r.active}</td>
              <td className="px-3 py-2 text-right">{r.done}</td>
              <td className="py-2 pl-3 text-right">{formatMinutes(r.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['work-items', 'dashboard'],
    queryFn: () => api.get('/dashboard').then((r) => r.data),
    refetchInterval: 60 * 1000,
  })

  if (query.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (query.isError) return <p role="alert" className="text-sm text-red-600">{errorMessage(query.error)}</p>

  const { totals, by_category: categories, by_employee: employees, recent, scope } = query.data
  const withHours = employees.filter((e) => e.minutes > 0).map((e) => ({ ...e, hours: hours(e.minutes) }))
  const showTeam = user.role !== 'EMPLOYEE'

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        {scope} · {formatDateTime(query.data.date, false)} · everything unfinished, plus what was finished today
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Work items" value={totals.total} />
        <Tile label="Finished today" value={totals.done} />
        <Tile label="In progress" value={totals.active} />
        <Tile label="To do" value={totals.open} />
        <Tile label="Time logged today" value={formatMinutes(totals.minutes)} />
        <Tile label="Overdue" value={totals.overdue} note="past the due date, not finished"
          tone={totals.overdue ? 'text-red-600' : 'text-slate-900'} />
      </div>

      {totals.total === 0 && totals.minutes === 0 ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          No open work and nothing finished today. Add work from <Link to="/my-work" className="underline">My Work</Link>.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          <Card title="Work by category" hint="How much each category has to do, has in progress, and finished today.">
            <ResponsiveContainer width="100%" height={categories.length * 44 + 70}>
              <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barSize={22}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={axisTick} stroke="#cbd5e1" />
                <YAxis type="category" dataKey="name" width={170} tick={axisTick} stroke="#cbd5e1" />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 13 }}
                  itemSorter={(item) => SERIES.findIndex((s) => s.key === item.dataKey)} formatter={(value) => <span className="text-slate-700">{value}</span>} />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="work" fill={s.color} stroke="#ffffff" strokeWidth={2} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4"><CountTable rows={categories} firstColumn="Category" /></div>
          </Card>

          {showTeam && (
            <Card title="Team today" hint="Work assigned to each person, and the time each person logged today.">
              {withHours.length > 0 && (
                <ResponsiveContainer width="100%" height={withHours.length * 40 + 50}>
                  <BarChart data={withHours} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barSize={18}>
                    <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={axisTick} stroke="#cbd5e1" unit="h" />
                    <YAxis type="category" dataKey="name" width={170} tick={axisTick} stroke="#cbd5e1" />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value, name, item) => [formatMinutes(item.payload.minutes), 'Time logged today']} />
                    <Bar dataKey="hours" fill={HOURS_COLOR} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-4"><CountTable rows={employees} firstColumn="Employee" /></div>
            </Card>
          )}

          <Card title="Recent activity">
            <ul className="space-y-2 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-2">
                  <span className="w-40 shrink-0 text-slate-500">{formatDateTime(a.created_at)}</span>
                  <span>
                    <Link to={`/work/${a.work_item_id}`} className="font-medium text-blue-700 hover:underline">{a.number}</Link>{' '}
                    <span className="font-medium">{a.employee}</span> {activityText(a)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
