import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'

// `roles` limits who sees a page. No `roles` means everyone.
export const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/my-work', label: 'My Work' },
  { to: '/all-work', label: 'All Work' },
  { to: '/reports', label: 'Reports' },
  { to: '/team', label: 'Team', roles: ['MANAGER', 'ADMIN'] },
  { to: '/admin', label: 'Admin', roles: ['ADMIN'] },
]

export const canSee = (item, user) => !item.roles || item.roles.includes(user.role)

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300 print:hidden">
        <div className="px-5 py-5">
          <div className="text-lg font-semibold text-white">WorkHub</div>
          <div className="text-xs text-slate-400">{user.department_name}</div>
        </div>
        <nav className="flex-1 px-3">
          {NAV.filter((item) => canSee(item, user)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${
                  isActive ? 'bg-slate-700 font-medium text-white' : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-700 px-5 py-4">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="text-xs text-slate-400">{user.role}</div>
          <button onClick={logout} className="mt-2 text-xs text-slate-300 underline hover:text-white">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}
