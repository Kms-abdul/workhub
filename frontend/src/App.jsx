import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout, { NAV, canSee } from './components/Layout'
import Admin from './pages/Admin'
import AllWork from './pages/AllWork'
import WorkItemDetail from './pages/WorkItemDetail'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import MyWork from './pages/MyWork'
import Profile from './pages/Profile'
import Reports from './pages/Reports'
import Team from './pages/Team'

// Placeholder until each screen is built in its own step.
function ComingSoon({ title }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">This screen is not built yet.</p>
    </div>
  )
}

const PAGES = {
  '/': <Dashboard />, '/my-work': <MyWork />, '/all-work': <AllWork />, '/reports': <Reports />, '/team': <Team />, '/admin': <Admin />,
  '/profile': <Profile />,
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        {user &&
          NAV.filter((item) => canSee(item, user)).map((item) => (
            <Route key={item.to} path={item.to} element={PAGES[item.to] ?? <ComingSoon title={item.label} />} />
          ))}
        <Route path="/work/:id" element={<WorkItemDetail />} />
        <Route
          path="*"
          element={
            <div>
              <h1 className="text-2xl font-semibold">Page not found</h1>
              <p className="mt-1 text-sm text-slate-500">This page does not exist, or your role cannot open it.</p>
            </div>
          }
        />
      </Route>
    </Routes>
  )
}
