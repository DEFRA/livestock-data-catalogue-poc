import { once } from 'node:events'
import { createRequire } from 'node:module'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

// The Kit reads its configuration when it is first loaded, so the
// environment must be set before it is required. Tests run with NODE_ENV
// test and sign-in turned off unless they ask for another environment, for
// example the production one CDP uses.
export async function startApp({ environment = {} } = {}) {
  const settings = { NODE_ENV: 'test', USE_AUTH: 'false', ...environment }
  for (const [name, value] of Object.entries(settings)) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  const app = require('govuk-prototype-kit/server.js')
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  return {
    baseUrl,
    // Fetches a page without following redirects. A form is posted as a
    // browser would post it, and a cookie is sent as a browser would.
    async getPage(path, { form, cookie } = {}) {
      const response = await fetch(new URL(path, baseUrl), {
        method: form ? 'POST' : 'GET',
        body: form ? new URLSearchParams(form) : undefined,
        headers: cookie ? { cookie } : {},
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
