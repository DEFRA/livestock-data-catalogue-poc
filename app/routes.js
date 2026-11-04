import govukPrototypeKit from 'govuk-prototype-kit'

import { pageNotFound, problemWithTheService } from './lib/handlers/errors.js'
import { pageDefaults } from './lib/handlers/page-defaults.js'
import { renderPage } from './lib/handlers/pages.js'

const router = govukPrototypeKit.requests.setupRouter()

router.use(pageDefaults)

router.get('/', renderPage('index'))
router.get('/report-a-problem', renderPage('report-a-problem'))
router.get('/accessibility-statement', renderPage('accessibility-statement'))
router.get('/cookies', renderPage('cookies'))
router.get('/privacy', renderPage('privacy'))

router.use(pageNotFound)
router.use(problemWithTheService)
