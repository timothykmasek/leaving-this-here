'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GemGlyph } from '@/components/GemGlyph'

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
    <header className="border-b border-stone-300/60 bg-paper/80 backdrop-blur-sm">
      <nav className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-serif text-lg tracking-tight text-ink">
            <GemGlyph className="h-[18px] w-[18px] text-ink/65" />
            <span>internet gems</span>
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
              </>
            )}

            {user && profile ? (
              <div className="flex items-center gap-4">
                <Link href={`/${profile.username}`} className="text-sm text-gray-500 hover:text-gray-900">
                  profile
                </Link>
                <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-900">
                  sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 px-4 py-1.5 rounded-full transition-colors"
              >
                sign in
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
