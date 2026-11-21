import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { allCategories, formatMinutes, useConfig } from '../api/hooks'
import QuickLog from '../components/QuickLog'
import { Priority, darkButton, kindClass, lightButton } from '../components/ui'

// Local date as YYYY-MM-DD (toISOString would give the UTC date, which can be yesterday).
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const rowButton ='rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-60'

// Seconds on the running timer: what the server reported, plus the time since it reported it.
function useElapsed(timerQuery) {
  const [now, setNow] = useState(Date.now())
  const running = !!timerQuery.data
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  if (!running) return 0
  return timerQuery.data.elapsed_seconds + Math.max(0, Math.floor((now - timerQuery.dataUpdatedAt) / 1000))
}

const clock = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Inline "I forgot the timer" form.
function ManualTime({ item, onClose }) {
  const queryClient = useQueryClient()
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0)

  const save = useMutation({
    mutationFn: () => api.post(`/work-items/${item.id}/time`, { minutes: total, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] })
      onClose()
    },
  })
  const box = 'w-16 rounded-md border border-slate-300 px-2 py-1 text-sm'

  return (
    <tr className="border-b border-slate-100 bg-slate-50">
      <td />
      <td colSpan={5} className="px-4 py-3">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Add time to {item.number}:</span>
          <input type="number" min="0" max="24" autoFocus value={hours} onChange={(e) => setHours(e.target.value)} className={box} aria-label="Hours" />
          <span>h</span>
          <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={box} aria-label="Minutes" />
          <span>m</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <button type="submit" disabled={total < 1 || save.isPending} className={`${darkButton} !px-3 !py-1`}>Add</button>
          <button type="button" onClick={onClose} className={`${lightButton} !px-3 !py-1`}>Cancel</button>
          {save.isError && <span role="alert" className="w-full text-red-600">{errorMessage(save.error)}</span>}
        </form>
      </td>
    </tr>
  )
}

function WorkRow({ item, category, actions, busy, runningHere, elapsed }) {
  const [addingTime, setAddingTime] = useState(false)
  const statuses = category?.statuses ?? [item.status]
  const doneStatus = statuses.find((s) => s.kind === 'DONE')
  const isDone = item.status.kind === 'DONE'
  const details = Object.values(item.custom_data).filter(Boolean).join(' · ')

  return (
    <>
      <tr className={`border-b border-slate-100 align-top last:border-0 ${runningHere ? 'bg-brand-light' : ''}`}>
        <td className="whitespace-nowrap px-4 py-3 text-xs">
          <Link to={`/work/${item.id}`} className="font-medium text-brand hover:underline">{item.number}</Link>
        </td>
        <td className="px-4 py-3">
          <div className={`font-medium ${isDone ? 'text-slate-500' : ''}`}>{item.title}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {[item.category.name, item.classification?.name, details].filter(Boolean).join(' · ')}
          </div>
        </td>
        <td className="px-4 py-3"><Priority value={item.priority} /></td>
        <td className="px-4 py-3">
          <select value={item.status.id} disabled={busy} aria-label={`Status of ${item.number}`}
            onChange={(e) => actions.changeStatus(item, Number(e.target.value))}
            className={`max-w-full rounded-md border-0 px-2 py-1 text-xs font-medium ${kindClass(item.status.kind)}`}>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {formatMinutes(item.total_minutes)}
          {runningHere && <div className="font-mono text-xs font-medium text-brand" aria-label="Timer running">+ {clock(elapsed)}</div>}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap justify-end gap-1">
            {!isDone && (runningHere ? (
              <button type="button" disabled={busy} onClick={() => actions.stop(item)}
                className={`${rowButton} border-brand bg-brand text-white hover:bg-brand-dark`}>Pause</button>
            ) : (
              <button type="button" disabled={busy} onClick={() => actions.start(item)}
                className={`${rowButton} border-slate-300 hover:bg-slate-100`}>Start</button>
            ))}
            <button type="button" onClick={() => setAddingTime(!addingTime)}
              className={`${rowButton} border-slate-300 hover:bg-slate-100`}>+ Time</button>
            {/* Always there, also on finished work: opens the item to change anything about it. */}
            <Link to={`/work/${item.id}`} aria-label={`Edit ${item.number}`}
              className={`${rowButton} border-slate-300 hover:bg-slate-100`}>Edit</Link>
            {!isDone && doneStatus && (
              <button type="button" disabled={busy} onClick={() => actions.changeStatus(item, doneStatus.id)}
                className={`${rowButton} border-green-600 text-green-700 hover:bg-green-50`}>Complete</button>
            )}
          </div>
        </td>
      </tr>
      {addingTime && <ManualTime item={item} onClose={() => setAddingTime(false)} />}
    </>
  )
}

function WorkTable({ title, items, empty, timer, elapsed, categoryOf, ...rowProps }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-semibold">{title} <span className="font-normal text-slate-500">({items.length})</span></h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">{empty}</p>
        ) : (
          <table className="w-full min-w-[820px] table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-28 px-4 py-2">No.</th>
                <th className="px-4 py-2">Work</th>
                <th className="w-24 px-4 py-2">Priority</th>
                <th className="w-48 px-4 py-2">Status</th>
                <th className="w-24 px-4 py-2">Time</th>
                <th className="w-60 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <WorkRow key={item.id} item={item} category={categoryOf(item)}
                  runningHere={timer?.work_item_id === item.id} elapsed={elapsed} {...rowProps} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default function MyWork() {
  const queryClient = useQueryClient()
  const config = useConfig()
  const categories = allCategories(config.data)
  const categoryOf = (item) => categories.find((c) => c.id === item.category.id)

  // The day being filled in. Today shows open work too; an earlier day shows just that day's sheet.
  const today = localDate(new Date())
  const [day, setDay] = useState(today)
  const isToday = day === today
  const work = useQuery({
    queryKey: ['work-items', 'mine', day],
    queryFn: () => api.get('/work-items', { params: isToday ? { mine: 1, today: 1 } : { mine: 1, day } }).then((r) => r.data),
  })
  // Asking the server on every page load is what makes the timer survive a reload.
  const timer = useQuery({ queryKey: ['timer'], queryFn: () => api.get('/timer').then((r) => r.data) })
  const elapsed = useElapsed(timer)

  const act = useMutation({
    mutationFn: (request) => api(request),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] })
      queryClient.invalidateQueries({ queryKey: ['timer'] })
    },
  })
  const actions = {
    changeStatus: (item, statusId) => act.mutate({ method: 'patch', url: `/work-items/${item.id}`, data: { status_id: statusId } }),
    start: (item) => act.mutate({ method: 'post', url: `/work-items/${item.id}/timer/start` }),
    stop: (item) => act.mutate({ method: 'post', url: `/work-items/${item.id}/timer/stop` }),
  }

  const items = work.data ?? []
  const open = items.filter((i) => i.status.kind !== 'DONE')
  const done = items.filter((i) => i.status.kind === 'DONE')
  const todayMinutes = items.reduce((sum, i) => sum + i.total_minutes, 0)
  const tableProps = { categoryOf, actions, busy: act.isPending, timer: timer.data, elapsed }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Work</h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {todayMinutes > 0 && ` · ${formatMinutes(todayMinutes)} logged on this list`}
            {!isToday && (
              <button type="button" onClick={() => setDay(today)} className="ml-2 underline">Back to today</button>
            )}
          </p>
        </div>
      </div>

      <QuickLog day={day} onDayChange={setDay} today={today} />

      {timer.data && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-brand/30 bg-brand-light px-4 py-2 text-sm text-brand-dark">
          <span className="font-mono font-semibold">{clock(elapsed)}</span>
          <span className="min-w-0 flex-1 truncate">Timer running on {timer.data.number} — {timer.data.title}</span>
          <button type="button" disabled={act.isPending} onClick={() => actions.stop({ id: timer.data.work_item_id })}
            className={`${rowButton} border-brand bg-brand text-white hover:bg-brand-dark`}>Pause</button>
        </div>
      )}


      {work.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(work.error)}</p>}
      {act.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(act.error)}</p>}
      {work.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : isToday ? (
        <>
          <WorkTable title="To do and in progress" items={open} empty="Nothing open. Add the work you are doing." {...tableProps} />
          <WorkTable title="Finished today" items={done} empty="Nothing finished yet today." {...tableProps} />
        </>
      ) : (
        <WorkTable title="Logged or finished on this day" items={items} empty="Nothing was logged on this day. Add a row above." {...tableProps} />
      )}
    </div>
  )
}
