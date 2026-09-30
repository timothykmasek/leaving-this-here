// First paint. popup.js is a module and waits on its imports, so until it
// runs the page shows whatever the HTML shows. The card (?card=1) is only
// ever opened signed in, so it starts on its own plate ("Loading…") instead
// of the popup's bare loading line. Runs before popup.js, synchronously.
if (new URLSearchParams(location.search).get('card') === '1') {
  document.getElementById('view-loading').classList.add('hidden')
  document.getElementById('view-save').classList.remove('hidden')
}
