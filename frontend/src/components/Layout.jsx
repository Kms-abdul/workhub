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
      {/* Sidebar background and text come from Admin > Appearance (bg-sidebar, text-sidebar-text).
          Lines and hover shades are made from the text colour, so they suit a light or a dark sidebar. */}
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-sidebar-text/15 bg-sidebar text-sidebar-text print:hidden">
        <div className="border-b-2 border-accent px-5 py-4">
          <div className="text-lg font-bold">WorkHub</div>
          <div className="text-xs opacity-70">{user.department_name}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.filter((item) => canSee(item, user)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md border-l-4 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive
                    ? 'border-accent bg-brand-light font-semibold text-brand'
                    : 'border-transparent hover:bg-sidebar-text/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-sidebar-text/15 px-5 py-4">
          <div className="truncate text-sm font-semibold">{user.name}</div>
          <div className="text-xs opacity-70">{user.role}</div>
          <button onClick={logout} className="mt-2 text-xs underline opacity-90 hover:opacity-100">
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 py-2.5 print:border-0 print:px-0">
          <img src="/ms-education-academy.webp" alt="MS Education Academy, preparing world worthy individuals" className="h-10 rounded" />
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-500 sm:block">Powered by</span>
            <img src="/de-logo.png" alt="DE" title={user.department_names.join(' · ')} className="h-9" />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-8 print:p-0 print:pt-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
