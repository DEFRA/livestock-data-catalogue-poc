// A visitor that uses the prototype as one browser would: it keeps the
// cookies the prototype sets, and posts forms with the token the last page
// put in its form.
export function visitor(app) {
  const cookies = new Map()
  let csrfToken

  function rememberCookies(headers) {
    for (const header of headers.getSetCookie()) {
      const [pair] = header.split(';')
      const [name, value] = pair.split('=')
      cookies.set(name, value)
    }
  }

  function cookieHeader() {
    return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  async function request(path, options = {}) {
    const page = await app.getPage(path, {
      ...options,
      cookie: cookies.size > 0 ? cookieHeader() : undefined
    })
    rememberCookies(page.headers)
    const token = page.document.querySelector('input[name="csrfToken"]')
    if (token) {
      csrfToken = token.value
    }
    return page
  }

  return {
    get cookies() {
      return cookies
    },
    get csrfToken() {
      return csrfToken
    },
    get: (path, options) => request(path, options),
    // Posts answers with this browser's token, as the page's form would.
    // Answers can be name and value pairs, to send a name more than once.
    post: (path, answers = {}, options = {}) =>
      request(path, {
        ...options,
        form: Array.isArray(answers)
          ? [['csrfToken', csrfToken], ...answers]
          : { csrfToken, ...answers }
      }),
    async follow(page) {
      return request(page.headers.get('location'))
    },
    // Chooses who the visitor is on the prototype settings page, then
    // loads the page it goes to, which has the session's new token
    async becomes(personaId) {
      await request('/prototype-settings')
      const saved = await this.post('/prototype-settings', { personaId })
      if (saved.status !== 303) {
        throw new Error(`Could not choose ${personaId}: ${saved.status}`)
      }
      await this.follow(saved)
      return saved
    }
  }
}
