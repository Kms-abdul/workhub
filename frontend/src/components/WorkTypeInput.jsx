import { useId } from 'react'
import { useWorkTypes } from '../api/hooks'
import { inputClass } from './ui'

// Work type box: start typing and pick a suggestion, or type a new one.
// The suggestions are one shared list: a type anyone has used before (say "Meeting")
// is offered to everyone, in every category. A new one joins the list when the work is saved.
export default function WorkTypeInput({ value, onChange }) {
  const listId = useId()
  const names = useWorkTypes().data ?? []

  return (
    <label className="block text-sm font-medium">
      Work type
      <input list={listId} value={value} maxLength={150} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} className={inputClass}
        placeholder={names.length ? 'Start typing, e.g. M for Meeting' : 'Type one, e.g. Meeting'} />
      <datalist id={listId}>
        {names.map((name) => <option key={name} value={name} />)}
      </datalist>
      <span className="mt-1 block text-xs font-normal text-slate-500">
        Optional. Pick a suggestion or type a new one; it is suggested to everyone next time.
      </span>
    </label>
  )
}

// Drop-down of the same shared list, for filtering screens and reports.
export function WorkTypeFilter({ value, onChange, className }) {
  const names = useWorkTypes().data ?? []
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Work type">
      <option value="">Any work type</option>
      {/* Keep a type from the address bar selectable even if it is not in the list (yet). */}
      {value && !names.some((n) => n.toLowerCase() === value.toLowerCase()) && <option value={value}>{value}</option>}
      {names.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  )
}
