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
      <div className="mx-auto max-w-3xl px-4 pt-28 pb-24 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-5xl sm:text-6xl font-light tracking-tight text-gray-900 leading-[1.05] mb-6">
            leave what you find<br />
            <span className="text-gray-400">here</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-10">
            bookmarks that don&rsquo;t disappear into a folder. a public shelf for the things
            worth coming back to — and the people worth following.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-500 hover:text-gray-900 px-4 py-3 transition-colors"
            >
              log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="px-6 py-3 bg-gray-900 text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-colors"
            >
              sign up
            </Link>
          </div>
        </div>

        {/* Quiet preview */}
        <div className="mt-28 pt-16 border-t border-gray-100">
          <p className="text-xs uppercase tracking-widest text-gray-400 text-center mb-10">
            a quieter place for the web
          </p>
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-8 sm:p-10">
            <div className="mb-6">
              <h2 className="text-xl font-medium text-gray-900 mb-1">alice</h2>
              <p className="text-sm text-gray-500 mb-4">bookmarks that caught my attention</p>
              <div className="flex gap-6 text-sm">
                <span><strong className="text-gray-900">24</strong> <span className="text-gray-500">links</span></span>
                <span><strong className="text-gray-900">8</strong> <span className="text-gray-500">followers</span></span>
                <span><strong className="text-gray-900">12</strong> <span className="text-gray-500">following</span></span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {[
                'from-stone-100 to-stone-200',
                'from-blue-50 to-indigo-50',
                'from-orange-50 to-amber-50',
              ].map((g, i) => (
                <div
                  key={i}
                  className={`aspect-[4/5] bg-gradient-to-br ${g} rounded-lg border border-gray-100`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Three-line pitch */}
        <div className="mt-24 grid sm:grid-cols-3 gap-10 sm:gap-6 text-center sm:text-left">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">save from anywhere</p>
            <p className="text-xs text-gray-500 leading-relaxed">one click from any site with the bookmarklet. no extension to install.</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">public by default</p>
            <p className="text-xs text-gray-500 leading-relaxed">share your shelf. a discreet private toggle for the rest.</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">follow other minds</p>
            <p className="text-xs text-gray-500 leading-relaxed">see what thoughtful people are reading. no feed, no algorithm.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
