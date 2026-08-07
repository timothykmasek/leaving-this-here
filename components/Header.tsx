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

  // The rebranded homepage, profile/list pages, and preview routes ship their
  // own Bulletin header — hide the global one there. Profile/list pages are any
  // first path segment that isn't a reserved app route. Compute this BEFORE the
  // effect so we can skip the auth + profiles round-trip on every route where the
  // header never renders (which, in practice, is nearly all of them).
  const RESERVED = ['login', 'start', 'setup', 'auth', 'privacy', 'bookmarklet', 'save', 'preview', 'api']
  const seg = pathname?.split('/')[1] || ''
  const isProfileOrList = seg !== '' && !RESERVED.includes(seg)
  // Pages that ship their own Bulletin header.
  const SELF_HEADER = ['login', 'start', 'setup', 'privacy', 'bookmarklet', 'save']
  const hidden =
    pathname === '/' || pathname?.startsWith('/preview') || isProfileOrList || SELF_HEADER.includes(seg)

  useEffect(() => {
    if (hidden) return
    const supabase = createClient()
    // Local session decode (no network) — good enough to render the header's
    // profile link / sign-out; nothing security-sensitive keys off it.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null
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
  }, [hidden])

  if (hidden) return null

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
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bulletin-logo.png" alt="Bulletin" className="h-[28px] w-auto" />
          </Link>

          <div className="flex items-center gap-6">
            {user && profile ? (
              <>
                <Link
                  href={`/${profile.username}`}
                  className="text-sm font-medium text-ink hover:text-ink/70"
                >
                  profile
                </Link>
                <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-900">
                  sign out
                </button>
              </>
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
