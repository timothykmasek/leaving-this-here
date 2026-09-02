'use client'

import { Children, useEffect, useState, type ReactNode } from 'react'

// Order-preserving masonry. CSS `columns` flow top-to-bottom per column, which
// scrambles a chronologically-ordered list when scanning row-by-row. Here we
// distribute children round-robin across N responsive columns, so reading
// left-to-right, top-to-bottom follows the original order (item 0,1,2,3 across
// the first row, 4,5,6,7 across the second, …) while keeping ragged heights.
export function Masonry({ children }: { children: ReactNode }) {
  const items = Children.toArray(children)
  const [cols, setCols] = useState(4)

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      setCols(w >= 1024 ? 4 : w >= 640 ? 3 : 2)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const columns: ReactNode[][] = Array.from({ length: cols }, () => [])
  items.forEach((child, i) => columns[i % cols].push(child))

  // Gaps: one interval in both axes, MATCHING THE PAGE MARGIN at each
  // breakpoint (16px under the profile's px-4, 40px under sm:px-10) so the
  // grid reads as evenly distributed rather than a block with a fat inner
  // gutter — on phones a fixed 40px gutter read wider than the 16px edges.
  return (
    <div className="flex gap-x-4 sm:gap-x-[40px]">
      {columns.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-y-4 sm:gap-y-[40px]">
          {col}
        </div>
      ))}
    </div>
  )
}
