import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { useConfig, useEmployees } from '../api/hooks'
import { useAuth } from '../auth'

const ROLES = ['EMPLOYEE', 'MANAGER', 'ADMIN']
const ROLE_HINT = {
  EMPLOYEE: 'Logs and sees only their own work.',
  MANAGER: 'Sees the work and reports of everyone in the departments and categories ticked below.',
  ADMIN: 'Sees and manages everything. Access settings below do not limit an admin.',
}
const input = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none'

function EmployeeForm({ employee, employees, departments, onClose }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isNew = !employee.id
  const [form, setForm] = useState({
    name: employee.name ?? '',
    email: employee.email ?? '',
    employee_code: employee.employee_code ?? '',
    phone: employee.phone ?? '',
    designation: employee.designation ?? '',
    role: employee.role ?? 'EMPLOYEE',
    manager_id: employee.manager_id ?? '',
    is_active: employee.is_active ?? true,
    password: '',
    department_id: employee.department_id ?? user.department_id,
    department_ids: employee.department_ids ?? [user.department_id],
    category_ids: employee.category_ids ?? [],
  })
  const [limitCategories, setLimitCategories] = useState((employee.category_ids ?? []).length > 0)
  const set = (field) => (e) =>
    setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const homeId = Number(form.department_id)
  const accessIds = [homeId, ...form.department_ids.filter((id) => id !== homeId)]
  const accessDepartments = departments.filter((d) => accessIds.includes(d.id))
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const changeHome = (e) => setForm({ ...form, department_id: Number(e.target.value) })
  const toggleDepartment = (id) => {
    const department_ids = toggle(accessIds, id)
    // Leaving a department also unticks its categories.
    const stillAllowed = departments.filter((d) => department_ids.includes(d.id)).flatMap((d) => d.categories.map((c) => c.id))
    setForm({ ...form, department_ids, category_ids: form.category_ids.filter((c) => stillAllowed.includes(c)) })
  }

  const save = useMutation({
    mutationFn: () => {
      const allowedCategories = accessDepartments.flatMap((d) => d.categories.map((c) => c.id))
      const body = {
        ...form,
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        department_id: homeId,
        department_ids: accessIds,
        category_ids: limitCategories ? form.category_ids.filter((c) => allowedCategories.includes(c)) : [],
      }
      if (!body.password) delete body.password
      return isNew ? api.post('/employees', body) : api.patch(`/employees/${employee.id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['config'] })
      onClose()
    },
  })

  const submit = (e) => {
    e.preventDefault()
    save.mutate()
  }
  const noCategoryTicked = limitCategories && form.category_ids.length === 0

  return (
    <form onSubmit={submit} className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{isNew ? 'Add employee' : `Edit ${employee.name}`}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Name
          <input required value={form.name} onChange={set('name')} className={input} />
        </label>
        <label className="text-sm font-medium">Email
          <input type="email" required value={form.email} onChange={set('email')} className={input} />
        </label>
        <label className="text-sm font-medium">Employee code
          <input value={form.employee_code} onChange={set('employee_code')} className={input} />
        </label>
        <label className="text-sm font-medium">Phone
          <input value={form.phone} onChange={set('phone')} className={input} />
        </label>
        <label className="text-sm font-medium">Designation
          <input value={form.designation} onChange={set('designation')} className={input} />
        </label>
        <label className="text-sm font-medium">Reporting manager
          <select value={form.manager_id} onChange={set('manager_id')} className={input}>
            <option value="">None</option>
            {employees.filter((e) => e.id !== employee.id && e.is_active).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">{isNew ? 'Password' : 'New password (leave blank to keep)'}
          <input type="password" required={isNew} minLength={8} autoComplete="new-password"
            value={form.password} onChange={set('password')} className={input} />
        </label>
        {!isNew && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
            Active (can sign in)
          </label>
        )}
      </div>

      <fieldset className="mt-6 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Access</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Role
            <select value={form.role} onChange={set('role')} className={input}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Home department
            <select value={homeId} onChange={changeHome} className={input}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-sm text-slate-500">{ROLE_HINT[form.role]}</p>

        {departments.length > 1 && (
          <div className="mt-4">
            <div className="text-sm font-medium">Departments this person can work in</div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={accessIds.includes(d.id)} disabled={d.id === homeId}
                    onChange={() => toggleDepartment(d.id)} />
                  {d.name}{d.id === homeId && <span className="text-slate-400"> (home)</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="text-sm font-medium">Categories</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="category-mode" checked={!limitCategories} onChange={() => setLimitCategories(false)} />
              All categories of these departments
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="category-mode" checked={limitCategories} onChange={() => setLimitCategories(true)} />
              Only the ones ticked
            </label>
          </div>
          {limitCategories && accessDepartments.map((d) => (
            <div key={d.id} className="mt-3">
              <div className="text-xs font-semibold uppercase text-slate-500">{d.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                {d.categories.filter((c) => c.is_active).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.category_ids.includes(c.id)}
                      onChange={() => setForm({ ...form, category_ids: toggle(form.category_ids, c.id) })} />
                    {c.name}
                  </label>
                ))}
                {d.categories.length === 0 && <span className="text-sm text-slate-500">No categories yet.</span>}
              </div>
            </div>
          ))}
          {noCategoryTicked && <p className="mt-2 text-sm text-red-600">Tick at least one category, or choose “All categories”.</p>}
        </div>
      </fieldset>

      {save.isError && <p role="alert" className="mt-4 text-sm text-red-600">{errorMessage(save.error)}</p>}

      <div className="mt-5 flex gap-2">
        <button type="submit" disabled={save.isPending || noCategoryTicked}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Team() {
  const { user } = useAuth()
  const isAdmin = user.role === 'ADMIN'
  const [editing, setEditing] = useState(null) // null = closed, {} = new, employee = edit

  const employees = useEmployees()
  const config = useConfig()
  const list = employees.data ?? []
  const departments = config.data ?? []
  const nameOf = (id) => list.find((e) => e.id === id)?.name ?? '—'
  const link = 'text-blue-700 hover:underline'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-slate-500">
            {list.length} {list.length === 1 ? 'person' : 'people'}
            {!isAdmin && ` in ${user.department_names.join(', ')}`}
          </p>
        </div>
        {isAdmin && !editing && (
          <button onClick={() => setEditing({})}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            + Add employee
          </button>
        )}
      </div>

      {editing && (
        <EmployeeForm key={editing.id ?? 'new'} employee={editing} employees={list} departments={departments}
          onClose={() => setEditing(null)} />
      )}

      {employees.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(employees.error)}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Departments</th>
              <th className="px-4 py-3">Categories</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-slate-500">{[e.designation, e.email].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="px-4 py-3">{e.role}</td>
                <td className="px-4 py-3">{e.role === 'ADMIN' ? 'All' : e.department_names.join(', ')}</td>
                <td className="max-w-xs px-4 py-3">
                  {e.role === 'ADMIN' || e.category_names.length === 0 ? 'All' : e.category_names.join(', ')}
                </td>
                <td className="px-4 py-3">{e.manager_id ? nameOf(e.manager_id) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={e.is_active ? 'text-green-700' : 'text-slate-400'}>
                    {e.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link to={`/all-work?assigned_to=${e.id}`} className={link}>Work</Link>
                  <span className="text-slate-300"> · </span>
                  <Link to={`/reports?tab=daily&employee_id=${e.id}`} className={link}>Daily report</Link>
                  {isAdmin && (
                    <>
                      <span className="text-slate-300"> · </span>
                      <button onClick={() => setEditing(e)} className="text-slate-600 underline hover:text-slate-900">Edit</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {employees.isLoading && (
              <tr><td className="px-4 py-3 text-slate-500" colSpan={7}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
