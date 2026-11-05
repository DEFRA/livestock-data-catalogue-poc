import govukPrototypeKit from 'govuk-prototype-kit'

import { showDataAsset } from './lib/handlers/data-asset.js'
import { pageNotFound, problemWithTheService } from './lib/handlers/errors.js'
import { showHealth } from './lib/handlers/health.js'
import { showHome } from './lib/handlers/home.js'
import { pageDefaults } from './lib/handlers/page-defaults.js'
import { renderPage } from './lib/handlers/pages.js'
import { searchDataAssets } from './lib/handlers/search.js'
import { createSignIn } from './lib/sign-in.js'

const router = govukPrototypeKit.requests.setupRouter()
const signIn = createSignIn()

router.use(pageDefaults)
router.get('/health', showHealth)
router.use(signIn.requireSignIn)

router.get('/sign-in', signIn.showSignIn)
router.post('/sign-in', signIn.signIn)
router.get('/sign-out', signIn.signOut)
router.get('/signed-out', renderPage('signed-out'))
router.get('/', showHome)
router.get('/data-assets', searchDataAssets)
router.get('/data-assets/:identifier', showDataAsset)
router.get('/report-a-problem', renderPage('report-a-problem'))
router.get('/accessibility-statement', renderPage('accessibility-statement'))
router.get('/cookies', renderPage('cookies'))
router.get('/privacy', renderPage('privacy'))

router.use(pageNotFound)
router.use(problemWithTheService)
