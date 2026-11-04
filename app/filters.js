import govukPrototypeKit from 'govuk-prototype-kit'

import { formatDate } from './lib/formatting.js'

govukPrototypeKit.views.addFilter('formatDate', formatDate)
