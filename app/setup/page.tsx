'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUserId(user.id)
      }
    })
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !username.trim()) return
    setError(null)
    setLoading(true)

    const cleanUsername = username.toLowerCase().trim()

    const { error: insertError } = await supabase.from('profiles').insert({
      id: userId,
      username: cleanUsername,
      display_name: displayName || cleanUsername,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        setError('username already taken')
      } else {
        setError(insertError.message)
      }
      setLoading(false)
      return
    }

    router.push(`/${cleanUsername}`)
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-light text-gray-900 mb-2">choose your username</h1>
          <p className="text-sm text-gray-500">this is how others will find you</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="alice"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
              required
            />
            <p className="text-xs text-gray-400 mt-1">lowercase letters, numbers, hyphens only</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">display name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alice Smith"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 mt-6"
          >
            {loading ? 'creating...' : 'create profile'}
          </button>
        </form>
      </div>
    </main>
  )
}
