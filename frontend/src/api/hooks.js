import { useQuery } from '@tanstack/react-query'
import api from './client'

// The whole configuration tree (departments > categories > statuses, issue list, fields).
// Loaded once and shared by every screen.
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get('/config').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

// The one shared list of work type names ("Meeting", "Session"…), for suggestions and filters.
// Its key starts with 'config', so it refreshes whenever a new type may have been added.
export function useWorkTypes() {
  return useQuery({
    queryKey: ['config', 'work-types'],
    queryFn: () => api.get('/work-types').then((r) => r.data),
    staleTime: 60 * 1000,
  })
}

export function useEmployees(enabled = true) {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then((r) => r.data),
    enabled,
  })
}

// All categories from the config, flat, each with its department name.
export const allCategories = (config) =>
  (config ?? []).flatMap((d) => d.categories.map((c) => ({ ...c, department_name: d.name, department_active: d.is_active })))

// Issue list as flat options: "Web › Frontend". Only active items.
export function classificationOptions(category, parentId = null, prefix = '') {
  return category.classifications
    .filter((c) => c.parent_id === parentId && c.is_active)
    .flatMap((c) => [
      { id: c.id, label: prefix + c.name },
      ...classificationOptions(category, c.id, `${prefix}${c.name} › `),
    ])
}

// One activity-log row as a sentence fragment: "changed status from Open to Resolved".
const ACTIVITY_TEXT = {
  CREATED: (a) => `created ${a.new_value}`,
  STATUS: (a) => `changed status from ${a.old_value} to ${a.new_value}`,
  ASSIGNED: (a) => `reassigned from ${a.old_value} to ${a.new_value}`,
  PRIORITY: (a) => `changed priority from ${a.old_value.toLowerCase()} to ${a.new_value.toLowerCase()}`,
  EDITED: (a) => `edited ${a.new_value}`,
  TIME: (a) => (a.new_value === 'removed' ? `removed a time entry of ${a.old_value}` : `logged ${a.new_value}`),
}
export const activityText = (a) => (ACTIVITY_TEXT[a.action] ?? (() => a.action.toLowerCase()))(a)

// Server times have no timezone; they are shown exactly as the server recorded them.
export const formatDateTime = (iso, withTime = true) => {
  if (!iso) return '—'
  const options = { day: 'numeric', month: 'short', year: 'numeric' }
  if (withTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' })
  return new Date(iso).toLocaleString(undefined, options)
}

export const formatMinutes = (minutes) => {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
}
