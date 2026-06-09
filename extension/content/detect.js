// Presence beacon. Runs at document_start on the internet gems web app's own
// origins (see manifest content_scripts.matches) and marks the document so the
// page can tell the extension is installed — and skip nagging the user to
// install it. The attribute lives on <html>, visible to the page's own JS even
// though this content script runs in an isolated world.
document.documentElement.setAttribute('data-ig-extension', '1')
