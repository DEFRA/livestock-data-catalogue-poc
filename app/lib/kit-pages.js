import { pageNotFound } from './handlers/errors.js'
import { pageDefaults } from './handlers/page-defaults.js'

const KIT_MANAGEMENT_PATH = '/manage-prototype'

// The Kit's script on every page tells the Kit that the page has loaded,
// which only its development tools use. An empty answer stops browsers
// showing an error for it.
export function pageLoaded(req, res) {
  res.sendStatus(204)
}

// On CDP the Kit's management pages only say to run the prototype locally,
// but 2 of them still work without our sign-in: the Kit's password page,
// which would be a second way to sign in, and its clear-data page, which
// saves a session file for anyone. So in production they all show Page not
// found. On a developer's computer the Kit needs them, so they stay.
export function closeKitPages(router, environment = process.env) {
  if (environment.NODE_ENV?.toLowerCase() === 'production') {
    router.get(`${KIT_MANAGEMENT_PATH}/page-loaded`, pageLoaded)
    router.use(KIT_MANAGEMENT_PATH, pageDefaults, pageNotFound)
  }
  return router
}
