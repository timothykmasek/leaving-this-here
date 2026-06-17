import { getSession, getFinds, AuthExpiredError } from './auth.js'

const app = document.getElementById('app')

function renderSignIn() {
  app.innerHTML = `
    <div class="empty">
      <div class="empty-title">sign in to see your finds</div>
      <p>Click the according to icon to sign in.</p>
    </div>
  `
}

async function loadFinds() {
  // No stored session at all → straight to the sign-in nudge.
  const session = await getSession()
  if (!session) {
    renderSignIn()
    return
  }

  try {
    // getFinds refreshes a near-expired token and retries once on 401, so a
    // stale access token no longer surfaces as a scary error on every tab.
    const data = await getFinds(40)
    const finds = data.finds || []

    if (finds.length === 0) {
      app.innerHTML = `
        <div class="empty">
          <div class="empty-title">no finds yet</div>
          <p>Click the according to icon to save your first find.</p>
        </div>
      `
      return
    }

    const grid = document.createElement('div')
    grid.className = 'grid'

    for (const find of finds) {
      const card = document.createElement('div')
      card.className = 'card'
      card.addEventListener('click', () => {
        window.open(find.url, '_blank')
      })

      const imageDiv = document.createElement('div')
      imageDiv.className = 'card-image'

      if (find.image_url) {
        const img = document.createElement('img')
        img.src = find.image_url
        img.alt = find.title || 'find'
        img.onerror = () => {
          img.style.display = 'none'
          imageDiv.textContent = '🔗'
        }
        imageDiv.appendChild(img)
      } else {
        imageDiv.className = 'card-image no-image'
        imageDiv.textContent = '🔗'
      }

      const content = document.createElement('div')
      content.className = 'card-content'

      const title = document.createElement('div')
      title.className = 'card-title'
      title.textContent = find.title || find.url

      const url = document.createElement('div')
      url.className = 'card-url'
      url.textContent = new URL(find.url).hostname

      content.appendChild(title)
      content.appendChild(url)

      card.appendChild(imageDiv)
      card.appendChild(content)
      grid.appendChild(card)
    }

    app.innerHTML = ''
    app.appendChild(grid)
  } catch (err) {
    // A dead/expired session (refresh token gone) isn't an error worth
    // alarming the user with — just invite them to sign in again.
    if (err instanceof AuthExpiredError || /not signed in/i.test(String(err?.message))) {
      renderSignIn()
      return
    }
    // Genuine failure (offline, server down). Keep it quiet and recoverable.
    app.innerHTML = `
      <div class="empty">
        <div class="empty-title">couldn't load your finds</div>
        <p>Check your connection and reload the tab.</p>
      </div>
    `
  }
}

loadFinds()
