import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'

const KINDS = ['OPEN', 'ACTIVE', 'DONE']
const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT']
const KIND_STYLE = {
  OPEN: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
}

const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none'
const smallBtn = 'rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40'
const darkBtn = 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60'

// One mutation for every admin change: call the API, then reload the config tree.
function useSave(setError) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ method, url, data }) => api({ method, url, data }),
    onMutate: () => setError(''),
    onError: (err) => setError(errorMessage(err)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  }).mutate
}

// Text box that saves when you leave it (or press Enter), only if the value changed.
function SaveOnBlur({ value, onSave, className = '', ...rest }) {
  return (
    <input
      key={value}
      defaultValue={value}
      className={`${input} ${className}`}
      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
      onBlur={(e) => {
        const next = e.target.value.trim()
        if (next && next !== value) onSave(next)
        else e.target.value = value
      }}
      {...rest}
    />
  )
}

// Up / down / delete buttons for a row in an ordered list.
function RowActions({ items, index, kind, save, onDelete }) {
  const move = (step) => {
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[index + step]] = [ids[index + step], ids[index]]
    save({ method: 'put', url: `/order/${kind}`, data: { ids } })
  }
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={smallBtn} disabled={index === 0} onClick={() => move(-1)} aria-label="Move up">↑</button>
      <button type="button" className={smallBtn} disabled={index === items.length - 1} onClick={() => move(1)} aria-label="Move down">↓</button>
      {onDelete && <button type="button" className={`${smallBtn} text-red-600`} onClick={onDelete}>Delete</button>}
    </div>
  )
}

// Small "type a name and press Add" form used by every list.
function AddForm({ placeholder, onAdd, children, button = 'Add' }) {
  const [name, setName] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), e.target)
    setName('')
    e.target.reset() // clears the extra boxes (prefix, code, choices)
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className={`${input} min-w-0 flex-1`} />
      {children}
      <button type="submit" className={darkBtn}>{button}</button>
    </form>
  )
}

function Section({ title, hint, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Statuses({ category, save }) {
  const items = category.statuses
  return (
    <Section title="Workflow statuses" hint="The steps work moves through. Kind tells reports whether a status counts as open, active or done.">
      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <SaveOnBlur value={s.name} className="min-w-0 flex-1" aria-label="Status name"
              onSave={(name) => save({ method: 'patch', url: `/statuses/${s.id}`, data: { name } })} />
            <select value={s.kind} aria-label="Kind" className={`${input} ${KIND_STYLE[s.kind]}`}
              onChange={(e) => save({ method: 'patch', url: `/statuses/${s.id}`, data: { kind: e.target.value } })}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="radio" name={`initial-${category.id}`} checked={s.is_initial}
                onChange={() => save({ method: 'patch', url: `/statuses/${s.id}`, data: { is_initial: true } })} />
              Start
            </label>
            <RowActions items={items} index={i} kind="statuses" save={save}
              onDelete={() => save({ method: 'delete', url: `/statuses/${s.id}` })} />
          </li>
        ))}
      </ul>
      <AddForm placeholder="New status name"
        onAdd={(name, form) => save({ method: 'post', url: '/statuses', data: { category_id: category.id, name, kind: form.kind.value } })}>
        <select name="kind" defaultValue="ACTIVE" className={input} aria-label="Kind for new status">
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </AddForm>
    </Section>
  )
}

function ClassificationRows({ category, parentId, depth, save }) {
  const [addingTo, setAddingTo] = useState(null)
  const items = category.classifications.filter((c) => c.parent_id === parentId)
  return items.map((c, i) => (
    <li key={c.id}>
      <div className="flex flex-wrap items-center gap-2" style={{ paddingLeft: depth * 24 }}>
        <SaveOnBlur value={c.name} className={`min-w-0 flex-1 ${c.is_active ? '' : 'text-slate-400 line-through'}`} aria-label="Item name"
          onSave={(name) => save({ method: 'patch', url: `/classifications/${c.id}`, data: { name } })} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={c.is_active}
            onChange={(e) => save({ method: 'patch', url: `/classifications/${c.id}`, data: { is_active: e.target.checked } })} />
          Active
        </label>
        <button type="button" className={smallBtn} onClick={() => setAddingTo(addingTo === c.id ? null : c.id)}>+ Sub-item</button>
        <RowActions items={items} index={i} kind="classifications" save={save}
          onDelete={() => save({ method: 'delete', url: `/classifications/${c.id}` })} />
      </div>
      {addingTo === c.id && (
        <div style={{ paddingLeft: (depth + 1) * 24 }}>
          <AddForm placeholder={`New item under ${c.name}`}
            onAdd={(name) => {
              save({ method: 'post', url: '/classifications', data: { category_id: category.id, parent_id: c.id, name } })
              setAddingTo(null)
            }} />
        </div>
      )}
      <ul className="mt-2 space-y-2 empty:hidden">
        <ClassificationRows category={category} parentId={c.id} depth={depth + 1} save={save} />
      </ul>
    </li>
  ))
}

function Classifications({ category, save }) {
  return (
    <Section title="Work types" hint="This category's own list to pick from when logging work: kinds of task or issue, and everyday activities such as Meeting or Session. Leave it empty and employees just type what they did.">
      {category.classifications.length === 0 && (
        <p className="text-sm text-slate-500">No items. Employees will type what they did in their own words.</p>
      )}
      <ul className="space-y-2">
        <ClassificationRows category={category} parentId={null} depth={0} save={save} />
      </ul>
      <AddForm placeholder="New item"
        onAdd={(name) => save({ method: 'post', url: '/classifications', data: { category_id: category.id, name } })} />
    </Section>
  )
}

const toOptions = (text) => text.split(',').map((o) => o.trim()).filter(Boolean)

function CustomFields({ category, save }) {
  const items = category.custom_fields
  const [newType, setNewType] = useState('TEXT')
  return (
    <Section title="Extra form fields" hint="Additional boxes shown on the form for this category. For a SELECT field, list the choices separated by commas.">
      {items.length === 0 && <p className="text-sm text-slate-500">No extra fields.</p>}
      <ul className="space-y-2">
        {items.map((f, i) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2">
            <SaveOnBlur value={f.label} className="min-w-0 flex-1" aria-label="Field label"
              onSave={(label) => save({ method: 'patch', url: `/custom-fields/${f.id}`, data: { label } })} />
            {f.field_type === 'SELECT' ? (
              <SaveOnBlur value={f.options.join(', ')} className="min-w-0 flex-1" aria-label="Choices"
                onSave={(text) => save({ method: 'patch', url: `/custom-fields/${f.id}`, data: { options: toOptions(text) } })} />
            ) : null}
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{f.field_type}</span>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={f.is_required}
                onChange={(e) => save({ method: 'patch', url: `/custom-fields/${f.id}`, data: { is_required: e.target.checked } })} />
              Required
            </label>
            <RowActions items={items} index={i} kind="custom-fields" save={save}
              onDelete={() => save({ method: 'delete', url: `/custom-fields/${f.id}` })} />
          </li>
        ))}
      </ul>
      <AddForm placeholder="New field label"
        onAdd={(label, form) => {
          save({ method: 'post', url: '/custom-fields', data: {
            category_id: category.id, label, field_type: newType,
            options: newType === 'SELECT' ? toOptions(form.options.value) : [],
          } })
          setNewType('TEXT')
        }}>
        <select value={newType} onChange={(e) => setNewType(e.target.value)} className={input} aria-label="Type for new field">
          {FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {newType === 'SELECT' && <input name="options" placeholder="Choices: A, B, C" className={`${input} min-w-0 flex-1`} />}
      </AddForm>
    </Section>
  )
}

function CategoryDetails({ category, save }) {
  const patch = (data) => save({ method: 'patch', url: `/categories/${category.id}`, data })
  return (
    <Section title="Category" hint="Work item numbers use the prefix, for example DEV-0001.">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Name{' '}
          <SaveOnBlur value={category.name} onSave={(name) => patch({ name })} />
        </label>
        <label className="text-sm">Number prefix{' '}
          <SaveOnBlur value={category.ticket_prefix} className="w-24 uppercase" onSave={(ticket_prefix) => patch({ ticket_prefix })} />
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={category.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
          Active
        </label>
      </div>
    </Section>
  )
}

export default function Admin() {
  const [error, setError] = useState('')
  const [departmentId, setDepartmentId] = useState(null)
  const [categoryId, setCategoryId] = useState(null)
  const [addingDepartment, setAddingDepartment] = useState(false)
  const save = useSave(setError)

  const config = useQuery({ queryKey: ['config'], queryFn: () => api.get('/config').then((r) => r.data) })
  if (config.isLoading) return <div className="text-sm text-slate-500">Loading…</div>
  if (config.isError) return <div className="text-sm text-red-600">{errorMessage(config.error)}</div>

  const departments = config.data
  const department = departments.find((d) => d.id === departmentId) ?? departments.find((d) => d.is_active) ?? departments[0]
  const category = department?.categories.find((c) => c.id === categoryId) ?? department?.categories[0]

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-sm text-slate-500">Departments, categories, workflows and form fields. Changes save as you make them.</p>

      {error && (
        <div role="alert" className="sticky top-2 z-10 mt-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="underline">Dismiss</button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Department{' '}
          <select value={department?.id ?? ''} className={input}
            onChange={(e) => { setDepartmentId(Number(e.target.value)); setCategoryId(null) }}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
        {department && (
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={department.is_active}
              onChange={(e) => save({ method: 'patch', url: `/departments/${department.id}`, data: { is_active: e.target.checked } })} />
            Active
          </label>
        )}
        <button type="button" className={smallBtn} onClick={() => setAddingDepartment(!addingDepartment)}>+ Department</button>
      </div>

      {addingDepartment && (
        <div className="max-w-xl">
          <AddForm placeholder="Department name, e.g. Human Resources" button="Add department"
            onAdd={(name, form) => {
              save({ method: 'post', url: '/departments', data: { name, code: form.code.value } })
              setAddingDepartment(false)
            }}>
            <input name="code" required placeholder="Code, e.g. HR" className={`${input} w-32 uppercase`} />
          </AddForm>
        </div>
      )}

      {department && (
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4 lg:w-72 lg:shrink-0">
            <h2 className="font-semibold">Categories</h2>
            <ul className="mt-3 space-y-1">
              {department.categories.map((c, i) => (
                <li key={c.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => setCategoryId(c.id)}
                    className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm ${
                      c.id === category?.id ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'
                    } ${c.is_active ? '' : 'line-through opacity-60'}`}>
                    {c.name} <span className="text-xs opacity-70">{c.ticket_prefix}</span>
                  </button>
                  <RowActions items={department.categories} index={i} kind="categories" save={save} />
                </li>
              ))}
            </ul>
            {department.categories.length === 0 && <p className="mt-2 text-sm text-slate-500">No categories yet.</p>}
            <AddForm placeholder="New category name"
              onAdd={(name, form) => save({ method: 'post', url: '/categories', data: { department_id: department.id, name, ticket_prefix: form.prefix.value } })}>
              <input name="prefix" required placeholder="Prefix" maxLength={10} className={`${input} w-20 uppercase`} />
            </AddForm>
          </div>

          {category && (
            <div className="min-w-0 flex-1 space-y-6">
              <CategoryDetails category={category} save={save} />
              <Statuses category={category} save={save} />
              <Classifications category={category} save={save} />
              <CustomFields category={category} save={save} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
