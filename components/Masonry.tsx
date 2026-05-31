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

  return (
    <div className="flex gap-3">
      {columns.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
          {col}
        </div>
      ))}
    </div>
  )
}
