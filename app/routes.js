import govukPrototypeKit from 'govuk-prototype-kit'

import { requireValidForm } from './lib/csrf.js'
import { showDataAsset } from './lib/handlers/data-asset.js'
import { pageNotFound, problemWithTheService } from './lib/handlers/errors.js'
import { showHealth } from './lib/handlers/health.js'
import { showHome } from './lib/handlers/home.js'
import {
  listDataAssets,
  publishDataAsset,
  showHistory,
  showOverview,
  showPreview,
  showPublish,
  showPublished,
  showSection
} from './lib/handlers/manage.js'
import { pageDefaults } from './lib/handlers/page-defaults.js'
import { renderPage } from './lib/handlers/pages.js'
import {
  resetPrototype,
  savePrototypeSettings,
  showPrototypeSettings
} from './lib/handlers/prototype-settings.js'
import { searchDataAssets } from './lib/handlers/search.js'
import { sessionLocals } from './lib/handlers/session-locals.js'
import { ACTION_ROUTES, createDataAsset } from './lib/manage/action-pages.js'
import {
  requireCreator,
  requireManagedDataAsset,
  requireManager
} from './lib/manage/context.js'
import { DETAIL_QUESTIONS } from './lib/manage/detail-pages.js'
import { DISTRIBUTION_ROUTES } from './lib/manage/distribution-pages.js'
import { questionPage } from './lib/manage/question-page.js'
import { RELATION_ROUTES } from './lib/manage/relation-pages.js'
import { RESPONSIBILITY_ROUTES } from './lib/manage/responsibility-pages.js'
import { createPrototypeSessions } from './lib/prototype-session.js'
import { createSignIn } from './lib/sign-in.js'
import { csrfTokenFor } from './lib/working-copy.js'

const router = govukPrototypeKit.requests.setupRouter()
const signIn = createSignIn()
const prototypeSessions = createPrototypeSessions()
const checkForm = requireValidForm(csrfTokenFor)

router.use(pageDefaults)
router.get('/health', showHealth)
router.use(signIn.requireSignIn)
router.use(prototypeSessions.middleware)
router.use(sessionLocals)

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

router.get('/prototype-settings', showPrototypeSettings)
router.post('/prototype-settings', checkForm, savePrototypeSettings)
router.post('/prototype-settings/reset', checkForm, resetPrototype)

// Registering and maintaining data assets (journeys 2 and 3)
const DATA_ASSET = '/manage/data-assets/:identifier'

function addQuestion(path, definePage, ...checks) {
  const page = questionPage(definePage)
  router.get(path, ...checks, page.show)
  router.post(path, ...checks, checkForm, page.save)
}

router.use('/manage', requireManager)
router.get('/manage/data-assets', listDataAssets)
addQuestion('/manage/data-assets/create', createDataAsset, requireCreator)
router.get(DATA_ASSET, requireManagedDataAsset, showOverview)
router.get(`${DATA_ASSET}/publish`, requireManagedDataAsset, showPublish)
router.post(
  `${DATA_ASSET}/publish`,
  requireManagedDataAsset,
  checkForm,
  publishDataAsset
)
router.get(`${DATA_ASSET}/published`, requireManagedDataAsset, showPublished)
router.get(`${DATA_ASSET}/preview`, requireManagedDataAsset, showPreview)
router.get(`${DATA_ASSET}/history`, requireManagedDataAsset, showHistory)

const QUESTION_ROUTES = {
  ...Object.fromEntries(
    Object.entries(DETAIL_QUESTIONS).flatMap(([section, questions]) =>
      Object.entries(questions).map(([question, page]) => [
        `${section}/${question}`,
        page
      ])
    )
  ),
  ...RESPONSIBILITY_ROUTES,
  ...DISTRIBUTION_ROUTES,
  ...RELATION_ROUTES,
  ...ACTION_ROUTES
}
for (const [path, definePage] of Object.entries(QUESTION_ROUTES)) {
  addQuestion(`${DATA_ASSET}/${path}`, definePage, requireManagedDataAsset)
}
router.get(`${DATA_ASSET}/:section`, requireManagedDataAsset, showSection)

router.use(pageNotFound)
router.use(problemWithTheService)
