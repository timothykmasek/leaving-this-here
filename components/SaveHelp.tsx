'use client'

// Inline "how to save" help, shown in the profile save panel. Saving is
// extension-only — it captures the page from the user's own browser (their
// session/IP), so even paywalled / bot-blocked pages get a real card. This
// just points the user to the extension and adapts to whether it's installed.

// TODO: once the extension is published, set this to the Chrome Web Store URL
// and the CTA below turns into a one-click "Add to Chrome" link.
const WEB_STORE_URL = ''

export function SaveHelp({ extInstalled }: { extInstalled: boolean | undefined }) {
  return (
    <div className="mt-5 border-t border-gray-200 pt-5">
      {extInstalled ? (
        // Installed → quiet confirmation, no nagging.
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-emerald-600" aria-hidden>
            ✓
          </span>
          Bulletin extension installed — click the icon on any page to save it
          instantly.
        </p>
      ) : (
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
            save with one click
          </p>
          <p className="text-sm text-gray-700 mb-3">
            Add the Bulletin extension to Chrome to grab any page, image, or
            quote in one click — straight from your browser.
          </p>

          {WEB_STORE_URL ? (
            <a
              href={WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Add to Chrome →
            </a>
          ) : (
            <ol className="space-y-1.5 text-sm text-gray-600">
              <li>
                <strong className="text-gray-900">1.</strong> open{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                  chrome://extensions
                </code>{' '}
                and turn on <strong className="text-gray-900">Developer mode</strong>
              </li>
              <li>
                <strong className="text-gray-900">2.</strong> click{' '}
                <strong className="text-gray-900">Load unpacked</strong> and
                select the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">extension</code> folder
              </li>
              <li>
                <strong className="text-gray-900">3.</strong> pin the Bulletin
                icon — now one click saves the page you&apos;re on
              </li>
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
