'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', user.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [pathname])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    router.push('/')
    router.refresh()
  }

  return (
    <header className="border-b border-gray-100 bg-white">
      <nav className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-lg font-medium tracking-tight text-gray-900">
            leaving this here
          </Link>

          <div className="flex items-center gap-6">
            {user && (
              <>
                <Link
                  href="/discover"
                  className={`text-sm ${pathname === '/discover' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  discover
                </Link>
                <Link
                  href="/bookmarklet"
                  className={`text-sm ${pathname === '/bookmarklet' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  save
                </Link>
              </>
            )}

            {user && profile ? (
              <div className="flex items-center gap-4">
                <Link href={`/${profile.username}`} className="text-sm text-gray-500 hover:text-gray-900">
                  {profile.display_name || profile.username}
                </Link>
                <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-900">
                  sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900">
                sign in
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
