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
  tagline,
  widthClassName,
  stickyLogo,
}: {
  loggedIn: boolean
  logoClassName?: string
  tagline?: React.ReactNode
  widthClassName?: string
  stickyLogo?: boolean
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
          // During the private beta "Sign up" means the landing page's
          // request-access capture — the wizard can't finish for someone
          // who isn't on the guest list.
          : { label: 'Sign up', href: '/' }
      }
      logoClassName={logoClassName}
      tagline={tagline}
      widthClassName={widthClassName}
      stickyLogo={stickyLogo}
    />
  )
}
