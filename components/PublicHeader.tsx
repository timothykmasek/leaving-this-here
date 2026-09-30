'use client'

// Auth-aware header for public, server-rendered pages (e.g. a shared list at
// /username/<slug>). Logged-out visitors get "Sign in"; a logged-in viewer gets
// "Log out" — so a signed-in owner never sees a "Sign in" prompt on their own
// content. Mirrors the profile header's behaviour.
import { useRouter } from 'next/navigation'
import { BulletinHeader } from '@/components/BulletinHeader'
import { INVITE_ONLY } from '@/lib/beta'

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

  // The Supabase client loads only when someone actually signs out: readers of
  // a public list never need it, and it's a big chunk of the page's JS.
  const handleSignOut = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <BulletinHeader
      action={
        loggedIn
          ? { label: 'Log out', onClick: handleSignOut }
          // While INVITE_ONLY, "Sign up" means the landing page's
          // request-access capture: the wizard can't finish for someone
          // who isn't on the guest list.
          : { label: 'Sign up', href: INVITE_ONLY ? '/' : '/start' }
      }
      logoClassName={logoClassName}
      tagline={tagline}
      widthClassName={widthClassName}
      stickyLogo={stickyLogo}
    />
  )
}
