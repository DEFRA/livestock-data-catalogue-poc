import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { DEFRA_COLOUR } from '../../app/lib/brand.js'

// The Kit compiles the Sass when it starts, with its own copy of Sass. The
// tests compile it the same way, so a Sass error or a GOV.UK Frontend change
// fails the checks here rather than when CDP starts the container.
const kitRequire = createRequire(
  import.meta.resolve('govuk-prototype-kit/package.json')
)
const sass = kitRequire('sass')

const OPTIONS = {
  loadPaths: [fileURLToPath(new URL('../../', import.meta.url))],
  quietDeps: true,
  silenceDeprecations: ['import'],
  style: 'expanded'
}

const GOVUK_FRONTEND = [
  '$govuk-extensions-url-context: "/plugin-assets";',
  '$govuk-plugins-url-context: "/plugin-assets";',
  '$govuk-prototype-kit-major-version: 13;',
  '@import "node_modules/govuk-frontend/dist/govuk-prototype-kit/init";'
]

// The Kit's order: our settings, then GOV.UK Frontend, then our styles
function compileStylesheet({ withSettings = true } = {}) {
  const imports = [
    ...(withSettings ? ['@import "app/assets/sass/settings";'] : []),
    ...GOVUK_FRONTEND,
    '@import "app/assets/sass/application";'
  ]
  return sass.compileString(imports.join('\n'), OPTIONS).css
}

describe('the stylesheet', () => {
  let css

  before(() => {
    css = compileStylesheet()
  })

  test('has no GDS Transport, because the catalogue is not on GOV.UK', () => {
    assert.ok(!css.includes('GDS Transport'))
  })

  test('uses the Helvetica font stack', () => {
    assert.ok(
      css.includes(
        'font-family: "Helvetica Neue", helvetica, arial, sans-serif;'
      )
    )
  })

  test("uses Defra's colour as the brand colour", () => {
    assert.ok(css.includes(`--govuk-brand-colour: ${DEFRA_COLOUR};`))
  })

  test('includes the catalogue footer styles', () => {
    assert.match(css, /\.app-footer \{/)
  })

  test('makes the Defra header white, with the service name in Defra green', () => {
    const declarations = (selector) =>
      [...css.matchAll(new RegExp(`(?:^|\\n)${selector} \\{([^}]*)\\}`, 'g'))]
        .map((match) => match[1])
        .join('')

    assert.match(
      declarations('\\.app-generic-header--defra'),
      /background-color: #ffffff;/
    )
    assert.match(
      declarations('\\.app-generic-header__service-name'),
      new RegExp(`color: var\\(--govuk-brand-colour, ${DEFRA_COLOUR}\\);`)
    )
  })

  test('finds GOV.UK branding when our settings are left out', () => {
    const unbranded = compileStylesheet({ withSettings: false })

    assert.ok(unbranded.includes('GDS Transport'))
    assert.ok(!unbranded.includes(`--govuk-brand-colour: ${DEFRA_COLOUR};`))
  })
})

describe('the settings file', () => {
  test('compiles on its own, as the Kit compiles every file in the folder', () => {
    assert.doesNotThrow(() =>
      sass.compile(
        fileURLToPath(
          new URL('../../app/assets/sass/settings.scss', import.meta.url)
        ),
        OPTIONS
      )
    )
  })
})
