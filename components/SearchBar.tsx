'use client'

import { useState } from 'react'

interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
}

export function SearchBar({ onSearch, placeholder = 'search...' }: SearchBarProps) {
  const [query, setQuery] = useState('')

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onSearch(e.target.value) }}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm placeholder:italic placeholder:text-gray-400"
      />
      {query && (
        <button
          onClick={() => { setQuery(''); onSearch('') }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
        >
          ✕
        </button>
      )}
    </div>
  )
}
