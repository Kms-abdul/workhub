// Small shared pieces of UI.

export const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none'
export const darkButton =
  'rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60'
export const lightButton =
  'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60'

const KIND_STYLE = {
  OPEN: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-brand-light text-brand',
  DONE: 'bg-green-100 text-green-700',
}
const PRIORITY_STYLE = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-slate-700',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
}

export const kindClass = (kind) => KIND_STYLE[kind] ?? KIND_STYLE.OPEN

export function StatusBadge({ status }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kindClass(status.kind)}`}>
      {status.name}
    </span>
  )
}

export function Priority({ value }) {
  const label = value.charAt(0) + value.slice(1).toLowerCase()
  return <span className={`text-xs font-medium ${PRIORITY_STYLE[value]}`}>{label}</span>
}
