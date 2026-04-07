'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function FollowersPage() {
  const params = useParams()
  const username = params.username as string
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [people, setPeople] = useState<any[]>([])
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
        .select('follower_id, profiles:follower_id(id, username, display_name, bio)')
        .eq('following_id', prof.id)

      setPeople((rows || []).map((r: any) => r.profiles).filter(Boolean))
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
        <Link href={`/${username}`} className="text-xs text-gray-400 hover:text-gray-900">
          ← back to {profile.display_name || profile.username}
        </Link>
        <h1 className="mt-4 text-3xl font-light text-gray-900">followers</h1>
        <p className="text-sm text-gray-500 mb-8">
          people who follow {profile.display_name || profile.username}
        </p>

        {people.length === 0 ? (
          <p className="text-sm text-gray-400">no followers yet</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {people.map((p) => (
              <li key={p.id} className="py-4">
                <Link href={`/${p.username}`} className="block group">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base text-gray-900 group-hover:underline">
                      {p.display_name || p.username}
                    </span>
                    <span className="text-xs text-gray-400">@{p.username}</span>
                  </div>
                  {p.bio && <p className="text-xs text-gray-500 mt-1">{p.bio}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
