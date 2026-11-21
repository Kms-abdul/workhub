import { useId } from 'react'
import { categoryWorkTypes, useWorkTypes } from '../api/hooks'
import { inputClass } from './ui'

// Work type box: start typing and pick a suggestion, or type a new one.
// The suggestions are the types already used in this work's category only. A new one joins
// that category's list when the work is saved.
export default function WorkTypeInput({ category, value, onChange }) {
  const listId = useId()
  const names = categoryWorkTypes(category)

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
        Optional. Pick a suggestion or type a new one; it is suggested in {category?.name ?? 'this category'} next time.
      </span>
    </label>
  )
}

// Drop-down for filtering screens and reports. With a `category` it lists that category's types;
// without one it lists every type, because those screens look across categories.
export function WorkTypeFilter({ value, onChange, className, category }) {
  const everyType = useWorkTypes().data ?? []
  const names = category ? categoryWorkTypes(category) : everyType
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Work type">
      <option value="">Any work type</option>
      {/* Keep a type from the address bar selectable even if it is not in the list (yet). */}
      {value && !names.some((n) => n.toLowerCase() === value.toLowerCase()) && <option value={value}>{value}</option>}
      {names.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  )
}
