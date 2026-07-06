'use client'

// Auth-aware header for public, server-rendered pages (e.g. a shared list at
// /username/<slug>). Logged-out visitors get "Sign in"; a logged-in viewer gets
// "Log out" — so a signed-in owner never sees a "Sign in" prompt on their own
// content. Mirrors the profile header's behaviour.
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BulletinHeader } from '@/components/BulletinHeader'

export function PublicHeader({
  loggedIn,
  logoClassName,
}: {
  loggedIn: boolean
  logoClassName?: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <BulletinHeader
      action={
        loggedIn
          ? { label: 'Log out', onClick: handleSignOut }
          : { label: 'Sign in', href: '/login' }
      }
      logoClassName={logoClassName}
    />
  )
}
