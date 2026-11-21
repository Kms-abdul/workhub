import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { useAuth } from '../auth'

// Menu icons, drawn as simple line shapes on a 24x24 grid. They take the colour of the text around them.
const ICON_PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-6h4v6',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  myWork: 'M9 3h6v4H9zM9 5H5v16h14V5h-4M9 14l2 2 4-4',
  allWork: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  reports: 'M3 20h18M6 20v-8M11 20V5M16 20v-5M21 20V9',
  team: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.87M15.5 4.13a3.5 3.5 0 0 1 0 6.75',
  admin: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  signOut: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
}

const SIDEBAR_KEY = 'workhub_sidebar_collapsed'

export function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

// `roles` limits who sees a page. No `roles` means everyone.
export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/my-work', label: 'My Work', icon: 'myWork' },
  { to: '/all-work', label: 'All Work', icon: 'allWork' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/team', label: 'Team', icon: 'team', roles: ['MANAGER', 'ADMIN'] },
  { to: '/admin', label: 'Admin', icon: 'admin', roles: ['ADMIN'] },
  { to: '/profile', label: 'My Profile', icon: 'profile' },
]

export const canSee = (item, user) => !item.roles || item.roles.includes(user.role)

// "Home > All Work > QS-0003": where you are, with links back up.
function Breadcrumb() {
  const { pathname } = useLocation()
  const workId = pathname.match(/^\/work\/(\d+)/)?.[1]
  // Same query as the detail page (same key), so the work item is loaded once and shared.
  const item = useQuery({
    queryKey: ['work-items', 'detail', workId],
    queryFn: () => api.get(`/work-items/${workId}`).then((r) => r.data),
    enabled: !!workId,
    retry: false,
  }).data

  const page = NAV.find((n) => n.to === pathname)
  let trail
  if (workId) trail = [{ label: 'All Work', to: '/all-work' }, { label: item?.number ?? 'Work item' }]
  else if (page) trail = [{ label: page.label }]
  else trail = [{ label: 'Page not found' }]

  return (
    <nav aria-label="Breadcrumb" className="mb-4 print:hidden">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        <li>
          <Link to="/" className="flex items-center gap-1 rounded hover:text-brand">
            <Icon name="home" className="h-4 w-4" />
            Home
          </Link>
        </li>
        {trail.map((crumb, i) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-slate-400">›</span>
            {crumb.to
              ? <Link to={crumb.to} className="rounded hover:text-brand">{crumb.label}</Link>
              : <span aria-current={i === trail.length - 1 ? 'page' : undefined} className="font-medium text-slate-800">{crumb.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  // Whether the sidebar is folded to icons. Remembered on this computer.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const toggleSidebar = () => {
    setCollapsed(!collapsed)
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '0' : '1') } catch { /* private window: just don't remember */ }
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar background and text come from Admin > Appearance (bg-sidebar, text-sidebar-text).
          Lines and hover shades are made from the text colour, so they suit a light or a dark sidebar. */}
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-text/15 bg-sidebar text-sidebar-text transition-[width] duration-150 print:hidden ${collapsed ? 'w-16' : 'w-56'}`}>
        <div className={`flex items-center border-b-2 border-accent py-4 ${collapsed ? 'justify-center px-2' : 'justify-between gap-2 pl-5 pr-3'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-lg font-bold">WorkHub</div>
              <div className="truncate text-xs opacity-70">{user.department_name}</div>
            </div>
          )}
          {/* Three-line menu button: folds the sidebar down to icons, and opens it again. */}
          <button type="button" onClick={toggleSidebar} aria-expanded={!collapsed}
            aria-label={collapsed ? 'Open the menu' : 'Close the menu'} title={collapsed ? 'Open the menu' : 'Close the menu'}
            className="rounded-md p-2 hover:bg-sidebar-text/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Icon name="menu" />
          </button>
        </div>
        <nav aria-label="Main menu" className={`flex-1 space-y-1 py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
          {NAV.filter((item) => canSee(item, user)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md border-l-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'border-accent bg-brand-light font-semibold text-brand'
                    : 'border-transparent hover:bg-sidebar-text/10'
                }`
              }
            >
              <Icon name={item.icon} />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>
        {collapsed ? (
          <div className="flex justify-center border-t border-sidebar-text/15 py-3">
            <button type="button" onClick={logout} aria-label="Sign out" title={`Sign out (${user.name})`}
              className="rounded-md p-2 hover:bg-sidebar-text/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Icon name="signOut" />
            </button>
          </div>
        ) : (
          <div className="border-t border-sidebar-text/15 px-5 py-4">
            <Link to="/profile" title="Open my profile" className="block truncate text-sm font-semibold hover:underline">{user.name}</Link>
            <div className="text-xs opacity-70">{user.role}</div>
            <button onClick={logout} className="mt-2 text-xs underline opacity-90 hover:opacity-100">
              Sign out
            </button>
          </div>
        )}
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
          <Breadcrumb />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
