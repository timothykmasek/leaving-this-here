'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function FollowingPage() {
  const params = useParams()
  const username = params.username as string
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [following, setFollowing] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('username', username)
        .single()

      if (!prof) { setLoading(false); return }
      setProfile(prof)

      const { data: rows } = await supabase
        .from('follows')
        .select('following_id, profiles:following_id(username, display_name, bio)')
        .eq('follower_id', prof.id)

      setFollowing((rows || []).map((r: any) => r.profiles).filter(Boolean))
      setLoading(false)
    }
    load()
  }, [username, supabase])

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-4 py-12"><p className="text-gray-400">loading...</p></div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-4 py-12 text-center"><p className="text-gray-500">user not found</p></div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href={`/${username}`} className="text-xs text-gray-400 hover:text-gray-600">
            ← back to {profile.display_name || profile.username}
          </Link>
          <h1 className="mt-4 text-2xl font-light text-gray-900">following</h1>
          <p className="text-sm text-gray-500">
            people {profile.display_name || profile.username} follows
          </p>
        </div>

        {following.length === 0 ? (
          <p className="text-sm text-gray-400">not following anyone yet</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {following.map((u: any) => (
              <li key={u.username} className="py-4">
                <Link href={`/${u.username}`} className="group block">
                  <p className="text-sm font-medium text-gray-900 group-hover:underline">
                    {u.display_name || u.username}
                  </p>
                  {u.display_name && <p className="text-xs text-gray-400">{u.username}</p>}
                  {u.bio && <p className="mt-1 text-xs text-gray-500">{u.bio}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
