import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { findAccessibilityViolations } from '../helpers/accessibility.js'

describe('the accessibility check', () => {
  test('finds a text input with no label and an image with no alternative text', async () => {
    const html = `<!DOCTYPE html>
      <html lang="en"><head><title>Broken page</title></head>
      <body><main><h1>Broken page</h1><input type="text" name="q"><img src="/chart.png"></main></body></html>`

    const rules = (await findAccessibilityViolations(html)).map(
      (violation) => violation.rule
    )

    assert.ok(rules.includes('label'), rules.join(', '))
    assert.ok(rules.includes('image-alt'), rules.join(', '))
  })
})
