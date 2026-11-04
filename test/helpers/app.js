import { once } from 'node:events'
import { createRequire } from 'node:module'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

// The Kit reads its configuration when it is first loaded, so the
// environment must be set before it is required
export async function startApp() {
  process.env.NODE_ENV = 'test'
  process.env.USE_AUTH = 'false'

  const app = require('govuk-prototype-kit/server.js')
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  return {
    baseUrl,
    async getPage(path) {
      const response = await fetch(new URL(path, baseUrl), {
        redirect: 'manual'
      })
      const html = await response.text()
      return {
        status: response.status,
        headers: response.headers,
        html,
        document: new JSDOM(html).window.document
      }
    },
    // Renders a view with the Kit's templates, for pages or data that no
    // request can reach in a test, such as the page for unexpected errors
    renderPage(view, locals = {}) {
      return new Promise((resolve, reject) => {
        app.render(view, locals, (error, html) => {
          if (error) {
            reject(error)
            return
          }
          resolve({ html, document: new JSDOM(html).window.document })
        })
      })
    },
    async stop() {
      server.close()
      await once(server, 'close')
      app.close()
    }
  }
}
