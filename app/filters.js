import govukPrototypeKit from 'govuk-prototype-kit'

import { formatDate } from './lib/formatting.js'
import { closeKitPages } from './lib/kit-pages.js'

govukPrototypeKit.views.addFilter('formatDate', formatDate)

// The Kit loads this file before it sets up its own routes, and runs routers
// in the order they were set up, so this router runs before the Kit's
// management pages, which app/routes.js can't reach. The page tests fail if
// a Kit upgrade changes that order.
closeKitPages(govukPrototypeKit.requests.setupRouter())
