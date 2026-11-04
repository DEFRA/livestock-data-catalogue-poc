import axe from 'axe-core'
import { JSDOM, VirtualConsole } from 'jsdom'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// Runs axe on the rendered HTML. jsdom does no layout, so axe reports
// colour contrast as incomplete rather than as a violation: check contrast
// in a browser instead.
export async function findAccessibilityViolations(html) {
  // axe tries canvas features jsdom doesn't have, so its warnings are dropped
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole()
  })
  dom.window.eval(axe.source)
  const results = await dom.window.axe.run(dom.window.document, {
    runOnly: { type: 'tag', values: WCAG_22_AA }
  })
  dom.window.close()
  // Copy the results out of jsdom's window, so they compare as plain arrays
  return [...results.violations].map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    elements: [...violation.nodes].map((node) => node.target.join(' '))
  }))
}
