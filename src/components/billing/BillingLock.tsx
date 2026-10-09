import { useState, type FormEvent } from 'react'
import { Lock, Loader2 } from 'lucide-react'
import { unlockBilling } from '../../hooks/useBilling'

export default function BillingLock() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await unlockBilling(password)
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'Wrong password')
      setPassword('')
    }
  }

  return (
    <div className="flex items-center justify-center py-10 sm:py-16">
      <div className="bg-bg-card rounded-xl border border-border p-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-accent-blue" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Billing</h1>
          <p className="text-text-muted text-sm text-center">This section is protected by a separate password</p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Billing password"
            autoFocus
            autoComplete="off"
            className="w-full px-4 py-2.5 rounded-lg bg-bg-primary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors mb-4"
          />

          {error && <p className="text-accent-red text-sm mb-4 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-accent-blue rounded-lg text-white font-medium hover:bg-accent-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Unlocking...</> : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
