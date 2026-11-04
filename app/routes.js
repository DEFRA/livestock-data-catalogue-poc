import govukPrototypeKit from 'govuk-prototype-kit'

import { showDataAsset } from './lib/handlers/data-asset.js'
import { pageNotFound, problemWithTheService } from './lib/handlers/errors.js'
import { showHome } from './lib/handlers/home.js'
import { pageDefaults } from './lib/handlers/page-defaults.js'
import { renderPage } from './lib/handlers/pages.js'
import { searchDataAssets } from './lib/handlers/search.js'

const router = govukPrototypeKit.requests.setupRouter()

router.use(pageDefaults)

router.get('/', showHome)
router.get('/data-assets', searchDataAssets)
router.get('/data-assets/:identifier', showDataAsset)
router.get('/report-a-problem', renderPage('report-a-problem'))
router.get('/accessibility-statement', renderPage('accessibility-statement'))
router.get('/cookies', renderPage('cookies'))
router.get('/privacy', renderPage('privacy'))

router.use(pageNotFound)
router.use(problemWithTheService)
