import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.access_token, data.user)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-sm font-black">TX</span>
          </div>
          <span className="font-bold text-white text-xl tracking-tight">Tradex</span>
        </div>

        <div className="bg-gray-900 border border-gray-800/60 rounded-2xl p-7 shadow-2xl">
          <h1 className="text-lg font-semibold text-white mb-1">Welcome back</h1>
          <p className="text-gray-500 text-sm mb-6">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700/50 placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700/50 placeholder:text-gray-600"
              />
            </div>
            {error && (
              <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-2.5">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-1"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-gray-600 text-sm text-center mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-400 hover:text-blue-300 transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
