import { ImageResponse } from 'next/og'
import { createSupabaseServer } from '@/lib/supabase/server'

// Dynamic Open Graph image for each folio — rendered on-the-fly by Next's
// edge runtime. Shows the creator's name, tagline, and a link-count meta,
// so Twitter / iMessage / Slack previews feel like a specific folio, not
// a generic site logo.

export const runtime = 'edge'
export const alt = 'leaving this here — folio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: { username: string } }) {
  const supabase = await createSupabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name, bio, id')
    .eq('username', params.username)
    .single()

  const name = profile?.display_name || profile?.username || params.username
  const tagline = profile?.bio || 'a folio on leaving this here'

  // Link count — quiet meta line. Best effort; skipped if query fails.
  let linkCount: number | null = null
  if (profile?.id) {
    const { count } = await supabase
      .from('bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('is_private', false)
    linkCount = count ?? null
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #fff 0%, #ffe9d6 55%, #fff 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 96px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#111',
        }}
      >
        <div
          style={{
            fontSize: 20,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#999',
            marginBottom: 20,
          }}
        >
          leaving this here
        </div>

        <div
          style={{
            fontSize: 110,
            fontWeight: 300,
            letterSpacing: -2,
            lineHeight: 1,
            maxWidth: 1040,
            color: '#111',
            marginBottom: 32,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {name}
        </div>

        <div
          style={{
            fontSize: 36,
            fontStyle: 'italic',
            color: '#555',
            maxWidth: 1040,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {tagline}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 96,
            fontSize: 22,
            color: '#888',
            display: 'flex',
            gap: 20,
          }}
        >
          <span>leavingthishere.com/{profile?.username || params.username}</span>
          {typeof linkCount === 'number' && (
            <>
              <span style={{ color: '#ddd' }}>·</span>
              <span>{linkCount} {linkCount === 1 ? 'link' : 'links'}</span>
            </>
          )}
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
