import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { errorMessage } from '../api/client'
import { useEmployees } from '../api/hooks'
import { useAuth } from '../auth'
import { darkButton, inputClass } from '../components/ui'

const ROLE_NAME = { EMPLOYEE: 'Employee', MANAGER: 'Manager', ADMIN: 'Admin' }

function Card({ title, hint, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const fromUser = (user) => ({
  name: user.name,
  email: user.email,
  employee_code: user.employee_code ?? '',
  phone: user.phone ?? '',
  designation: user.designation ?? '',
  manager_id: user.manager_id ? String(user.manager_id) : '',
})

// Everything a person knows best about themselves: they fill it in, not the admin.
function Details({ user }) {
  const queryClient = useQueryClient()
  const employees = useEmployees()
  const [form, setForm] = useState(fromUser(user))
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const saved = fromUser(user)
  const changed = Object.keys(saved).some((key) => form[key] !== saved[key])
  const emailChanged = form.email.trim().toLowerCase() !== user.email

  const save = useMutation({
    mutationFn: () =>
      api.patch('/auth/me', { ...form, manager_id: form.manager_id ? Number(form.manager_id) : null }).then((r) => r.data),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me)   // the sidebar name updates at once
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setForm(fromUser(me))
    },
  })

  return (
    <Card title="My details" hint="Fill these in and keep them up to date. They show on the Team page and on your work.">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Name
            <input required maxLength={150} value={form.name} onChange={set('name')} className={inputClass} autoComplete="name" />
          </label>
          <label className="block text-sm font-medium">Employee ID
            <input maxLength={50} value={form.employee_code} onChange={set('employee_code')} className={inputClass}
              placeholder="e.g. 502067" autoComplete="off" />
          </label>
          <label className="block text-sm font-medium">Email (you sign in with this)
            <input type="email" required maxLength={150} value={form.email} onChange={set('email')} className={inputClass} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">Phone
            <input maxLength={20} value={form.phone} onChange={set('phone')} className={inputClass} autoComplete="tel" inputMode="tel" />
          </label>
          <label className="block text-sm font-medium">Designation
            <input maxLength={100} value={form.designation} onChange={set('designation')} className={inputClass}
              placeholder="e.g. IT Analyst" autoComplete="organization-title" />
          </label>
          <label className="block text-sm font-medium">Reporting manager
            <select value={form.manager_id} onChange={set('manager_id')} className={inputClass}>
              <option value="">None</option>
              {(employees.data ?? []).filter((e) => e.id !== user.id && (e.is_active || String(e.id) === form.manager_id)).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        </div>
        {emailChanged && (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            After saving, you will sign in with <span className="font-medium">{form.email.trim().toLowerCase()}</span>. Your password stays the same.
          </p>
        )}
        {save.isError && <p role="alert" className="mt-4 text-sm text-red-600">{errorMessage(save.error)}</p>}
        {save.isSuccess && !changed && <p className="mt-4 text-sm text-green-700">Saved.</p>}
        <button type="submit" disabled={!changed || save.isPending} className={`${darkButton} mt-4`}>
          {save.isPending ? 'Saving…' : 'Save details'}
        </button>
      </form>
    </Card>
  )
}

function Password({ email }) {
  const blank = { current_password: '', new_password: '', again: '' }
  const [form, setForm] = useState(blank)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const mismatch = form.again !== '' && form.new_password !== form.again

  const save = useMutation({
    mutationFn: () => api.post('/auth/me/password', { current_password: form.current_password, new_password: form.new_password }),
    onSuccess: () => setForm(blank),
  })
  const submit = (e) => {
    e.preventDefault()
    if (!mismatch) save.mutate()
  }

  return (
    <Card title="Change password" hint="Use at least 8 characters. You stay signed in on this computer after changing it.">
      <form onSubmit={submit}>
        {/* Hidden username lets password managers save the new password against the right account. */}
        <input type="text" value={email} readOnly hidden autoComplete="username" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">Current password
            <input type="password" required value={form.current_password} onChange={set('current_password')}
              className={inputClass} autoComplete="current-password" />
          </label>
          <label className="block text-sm font-medium">New password
            <input type="password" required minLength={8} value={form.new_password} onChange={set('new_password')}
              className={inputClass} autoComplete="new-password" />
          </label>
          <label className="block text-sm font-medium">New password again
            <input type="password" required minLength={8} value={form.again} onChange={set('again')}
              className={`${inputClass} ${mismatch ? '!border-red-500' : ''}`} autoComplete="new-password" aria-invalid={mismatch} />
          </label>
        </div>
        {mismatch && <p role="alert" className="mt-4 text-sm text-red-600">The two new passwords are not the same.</p>}
        {save.isError && <p role="alert" className="mt-4 text-sm text-red-600">{errorMessage(save.error)}</p>}
        {save.isSuccess && <p className="mt-4 text-sm text-green-700">Password changed. Use the new one next time you sign in.</p>}
        <button type="submit" disabled={mismatch || save.isPending} className={`${darkButton} mt-4`}>
          {save.isPending ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </Card>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex flex-wrap gap-x-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="w-36 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium">{value}</dd>
    </div>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const isAdmin = user.role === 'ADMIN'

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">My Profile</h1>
      <p className="mt-1 text-sm text-slate-500">Your own details and password.</p>

      <div className="mt-6 space-y-6">
        <Details key={user.id} user={user} />
        <Password email={user.email} />
        <Card title="My access" hint="What you can see and log work in. This is set by your admin, so ask them if it needs to change.">
          <dl>
            <Row label="Role" value={ROLE_NAME[user.role] ?? user.role} />
            <Row label="Departments" value={isAdmin ? 'All' : user.department_names.join(', ')} />
            <Row label="Categories" value={isAdmin || user.category_names.length === 0 ? 'All' : user.category_names.join(', ')} />
          </dl>
        </Card>
      </div>
    </div>
  )
}
