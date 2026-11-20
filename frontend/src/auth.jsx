import { createContext, useContext } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api, { getToken, setToken } from './api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
    enabled: !!getToken(),
    retry: false,
  })

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    setToken(data.token)
    queryClient.setQueryData(['me'], data.employee)
  }

  const logout = () => {
    setToken(null)
    queryClient.clear()
    window.location.assign('/login')
  }

  const user = getToken() ? me.data ?? null : null
  const value = { user, loading: !!getToken() && me.isLoading, login, logout }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
