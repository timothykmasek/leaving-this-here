import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (profile) {
      redirect(`/${profile.username}`)
    } else {
      redirect('/setup')
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-5xl font-light tracking-tight text-gray-900 mb-4">
            leave what you find
          </h1>
          <p className="text-lg text-gray-500 mb-12 max-w-xl mx-auto leading-relaxed">
            a quiet space to save and share the things you discover. bookmark
            links, see what others are reading, follow people whose taste you
            trust.
          </p>
          <div className="flex justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              sign up
            </Link>
          </div>

          <div className="mt-24 pt-12 border-t border-gray-100">
            <div id="preview" className="space-y-4">
              <p className="text-sm text-gray-400 mb-8">
                see what a profile looks like
              </p>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-8 text-left">
                <div className="mb-6">
                  <h2 className="text-xl font-medium text-gray-900 mb-2">alice</h2>
                  <p className="text-sm text-gray-500 mb-4">bookmarks that caught my attention</p>
                  <div className="flex gap-6 text-sm">
                    <span><strong className="text-gray-900">24</strong> <span className="text-gray-500">links</span></span>
                    <span><strong className="text-gray-900">8</strong> <span className="text-gray-500">followers</span></span>
                    <span><strong className="text-gray-900">12</strong> <span className="text-gray-500">following</span></span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="aspect-square bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-gray-100" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center mt-8">clean, minimal, yours to share</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
