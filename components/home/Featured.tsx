import { FEATURED_PROFILES, FEATURED_LISTS } from '@/lib/homeContent'

// ── Featured ────────────────────────────────────────────────────────────────
// Two plain tables — Profiles and Lists — under "Looking back, it will all make
// sense". Rows are rule-separated, the count sits right in --ink-30, and there
// is deliberately no "See all" link. Every row points at a real Bulletin page.
//
// `compact` is the mobile variant: one column, 30px thumbnails, and counts
// shortened to `[ 142 ]` so a row never wraps.

function Thumbs({ srcs, compact }: { srcs: string[]; compact?: boolean }) {
  const size = compact ? 30 : 34
  // Lists show one strip split into three; profiles show two square thumbs.
  if (srcs.length === 3) {
    return (
      <div className="flex flex-none gap-px overflow-hidden rounded-lg" style={{ width: compact ? 64 : 72, height: size }}>
        {srcs.map((s) => (
          <span key={s} className="block flex-1 overflow-hidden bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s} alt="" className="block h-full w-full object-cover" />
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-none gap-1">
      {srcs.map((s) => (
        <span
          key={s}
          className="block overflow-hidden rounded-lg bg-card"
          style={{ width: size, height: size }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s} alt="" className="block h-full w-full object-cover" />
        </span>
      ))}
    </div>
  )
}

function Table({
  heading,
  rows,
  compact,
}: {
  heading: string
  rows: { name: string; href: string; count: string; thumbs: string[] }[]
  compact?: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline border-b border-black/[0.06] pb-[18px]">
        <h3 className={`${compact ? 'text-[18px]' : 'text-[20px]'} leading-6 text-black`}>{heading}</h3>
      </div>
      {rows.map((r) => (
        <a
          key={r.name}
          href={r.href}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-[18px] border-b border-black/[0.06] py-[18px]"
        >
          <Thumbs srcs={r.thumbs} compact={compact} />
          <span className={`flex-1 ${compact ? 'text-[17px]' : 'text-[18px]'} leading-[22px] text-black`}>
            {r.name}
          </span>
          <span className="whitespace-nowrap text-[12px] leading-4 tracking-[0.05em] text-black/30">
            [&nbsp;{compact ? r.count.replace(' items', '') : r.count}&nbsp;]
          </span>
        </a>
      ))}
    </div>
  )
}

export function Featured({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`mx-auto w-[1184px] max-w-full ${compact ? 'px-6 pt-10' : 'px-6 pt-16 xl:px-0'}`}>
      <h2
        className={`text-center ${
          compact ? 'mb-10 text-[26px] leading-8' : 'mb-24 text-[40px] leading-[46px]'
        } text-black`}
      >
        {/* Broken by hand on mobile at the clause, rather than wherever 342px
            of column happens to turn the line. */}
        {compact ? <>Looking back,<br />it will all make sense</> : 'Looking back, it will all make sense'}
      </h2>
      <div className={compact ? 'flex flex-col gap-10' : 'grid grid-cols-2 gap-20'}>
        <Table heading="Profiles" rows={FEATURED_PROFILES} compact={compact} />
        <Table heading="Lists" rows={FEATURED_LISTS} compact={compact} />
      </div>
    </section>
  )
}
