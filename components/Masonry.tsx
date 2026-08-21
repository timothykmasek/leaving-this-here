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

  // Gaps: 40px between columns and 40px between cards — one interval in both
  // axes, matching the page margin on the profile so the grid reads as evenly
  // distributed rather than a block with arbitrary inner spacing.
  return (
    <div className="flex gap-x-[40px]">
      {columns.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-y-[40px]">
          {col}
        </div>
      ))}
    </div>
  )
}
