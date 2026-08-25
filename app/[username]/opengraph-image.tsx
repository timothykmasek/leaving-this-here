import { ImageResponse } from 'next/og'
import { createSupabaseServer } from '@/lib/supabase/server'
import { loadCardo, loadLogo, PAPER, INK } from '@/lib/og'
import { clampDescription, SITE_DESCRIPTION } from '@/lib/meta'

// The share card for a folio — what a Bulletin link looks like in iMessage,
// Slack or a timeline.
//
// It used to be a blue gradient in system-ui, which predates the rebrand and
// looked like any other SaaS card. This is the page's own materials: paper,
// the dot ground, ink, Cardo, and the real wordmark rather than the word
// "Bulletin" set in whatever font happened to be available.

export const runtime = 'edge'
export const alt = 'Bulletin'
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
  const tagline = clampDescription(profile?.bio, 120) || SITE_DESCRIPTION

  let linkCount: number | null = null
  if (profile?.id) {
    const { count } = await supabase
      .from('bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
    linkCount = count ?? null
  }

  const [fonts, logo] = await Promise.all([
    loadCardo(),
    loadLogo(),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          ...PAPER,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: INK,
          fontFamily: 'Cardo, serif',
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo as any}
            alt="Bulletin"
            width={260}
            height={62}
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <div style={{ fontSize: 34, fontWeight: 700 }}>Bulletin</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              maxWidth: 1000,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {name}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 34,
              lineHeight: 1.35,
              color: 'rgba(43,43,43,0.6)',
              maxWidth: 900,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {tagline}
          </div>
        </div>

        {/* One string rather than flex children: Satori honoured the gap
            before the middot and not after it, so the count came out welded to
            the separator. */}
        <div style={{ display: 'flex', fontSize: 22, color: 'rgba(43,43,43,0.45)' }}>
          {[
            `yourbulletin.com/${profile?.username || params.username}`,
            typeof linkCount === 'number'
              ? `${linkCount} ${linkCount === 1 ? 'bullet' : 'bullets'}`
              : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? (fonts as any) : undefined }
  )
}
