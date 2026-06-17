import { getSession } from './auth.js'
import { CONFIG } from './config.js'

const app = document.getElementById('app')

async function loadFinds() {
  try {
    const session = await getSession()

    if (!session) {
      app.innerHTML = `
        <div class="empty">
          <div class="empty-title">sign in to see your finds</div>
          <p>Click the according to icon to sign in.</p>
        </div>
      `
      return
    }

    const res = await fetch(`${CONFIG.API_BASE}/api/extension/finds?limit=40`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`)
    }

    const data = await res.json()
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
    app.innerHTML = `
      <div class="error">
        <p>couldn't load your finds</p>
        <p style="font-size: 12px; margin-top: 8px;">${String(err)}</p>
      </div>
    `
  }
}

loadFinds()
