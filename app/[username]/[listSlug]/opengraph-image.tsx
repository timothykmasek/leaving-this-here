import { ImageResponse } from 'next/og'
import { createSupabaseServer } from '@/lib/supabase/server'
import { loadCardo, loadLogo, PAPER, INK } from '@/lib/og'
import { clampDescription } from '@/lib/meta'

// A list's own share card.
//
// Without this file the profile's card cascades down, so sharing "The fit
// check" showed Tim Masek and a count of every bullet he owns — branded, but
// about the wrong thing.
//
// The list's cover rides along when it has one, which is the picture its owner
// already chose for it. No cover → the type carries the card, same as a profile.

export const runtime = 'edge'
export const alt = 'Bulletin'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function ListOgImage({
  params,
}: {
  params: { username: string; listSlug: string }
}) {
  const supabase = await createSupabaseServer()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', params.username)
    .single()

  let name = params.listSlug
  let description: string | null = null
  let cover: string | null = null
  let count: number | null = null

  if (profile?.id) {
    const { data: list } = await supabase
      .from('lists')
      .select('id, name, description, cover_image_url')
      .eq('user_id', profile.id)
      .eq('slug', params.listSlug)
      .maybeSingle()

    if (list) {
      name = list.name || params.listSlug
      description = clampDescription(list.description, 110)
      // '' is "no cover at all" and null is "use the default band" — neither is
      // a picture, and only a real URL belongs on the card.
      cover = list.cover_image_url || null
      const { count: c } = await supabase
        .from('list_bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id)
      count = c ?? null
    }
  }

  const owner = profile?.display_name || profile?.username || params.username

  const [fonts, logo] = await Promise.all([
    loadCardo(),
    loadLogo(),
  ])

  // Satori decodes png, jpeg and svg — NOT webp, which it fails on silently,
  // drawing nothing while the layout still holds the space open. Covers
  // uploaded through the picker are webp (lib/imageResize writes webp), so
  // most will land here and take the full-width type-only layout instead of a
  // half-empty card. Checked by content-type rather than by extension: the
  // URL carries a ?v= cache-buster and the extension is not a promise anyway.
  const SATORI_FORMATS = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
  let coverOk = false
  if (cover) {
    try {
      const head = await fetch(cover, { method: 'HEAD' })
      const type = (head.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      coverOk = head.ok && SATORI_FORMATS.includes(type)
    } catch {
      coverOk = false
    }
  }

  return new ImageResponse(
    (
      <div style={{ ...PAPER, width: '100%', height: '100%', display: 'flex', color: INK, fontFamily: 'Cardo, serif' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '72px 0 72px 80px',
            width: coverOk ? 700 : 1200,
            paddingRight: coverOk ? 48 : 80,
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo as any} alt="Bulletin" width={220} height={52} style={{ objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: 30, fontWeight: 700 }}>Bulletin</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: coverOk ? 68 : 88,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {name}
            </div>
            {description && (
              <div
                style={{
                  marginTop: 18,
                  fontSize: coverOk ? 26 : 32,
                  lineHeight: 1.35,
                  color: 'rgba(43,43,43,0.6)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {description}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', fontSize: 21, color: 'rgba(43,43,43,0.45)' }}>
            {[`a list by ${owner}`, typeof count === 'number' ? `${count} ${count === 1 ? 'item' : 'items'}` : null]
              .filter(Boolean)
              .join('  ·  ')}
          </div>
        </div>

        {coverOk && cover && (
          <div style={{ display: 'flex', width: 500, height: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" width={500} height={630} style={{ objectFit: 'cover' }} />
          </div>
        )}
      </div>
    ),
    { ...size, fonts: fonts.length ? (fonts as any) : undefined }
  )
}
