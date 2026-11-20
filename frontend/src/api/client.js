import axios from 'axios'

const TOKEN_KEY = 'workhub_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)

// One axios instance for the whole app.
const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Session ended (expired token, deactivated account): go back to the login page.
api.interceptors.response.use(
  (response) => response,
  (err) => {
    const isLoginCall = err.config?.url === '/auth/login'
    if (err.response?.status === 401 && !isLoginCall && getToken()) {
      setToken(null)
      window.location.assign('/login')
    }
    return Promise.reject(err)
  },
)

// Readable message from a failed request.
export const errorMessage = (err) =>
  err.response?.data?.error || 'Something went wrong. Please try again.'

export default api
