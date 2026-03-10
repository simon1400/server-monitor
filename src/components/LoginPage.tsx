import { useState, type FormEvent } from 'react'
import { Lock, Loader2 } from 'lucide-react'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        onLogin()
      } else {
        setError('Неверный пароль')
        setPassword('')
      }
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-bg-card rounded-xl border border-border p-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-accent-blue" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Server Monitor</h1>
          <p className="text-text-muted text-sm">Введите пароль для доступа</p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Пароль"
            autoFocus
            className="w-full px-4 py-2.5 rounded-lg bg-bg-main border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors mb-4"
          />

          {error && (
            <p className="text-accent-red text-sm mb-4 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-accent-blue rounded-lg text-white font-medium hover:bg-accent-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
