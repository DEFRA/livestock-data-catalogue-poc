import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  TamperedFormError,
  checkAnswers,
  parseDate,
  readAnswers
} from '../../app/lib/forms.js'

const TITLE = {
  type: 'text',
  name: 'titleName',
  maxLength: 10,
  tooLong: 'Title must be 10 characters or fewer',
  required: 'Enter a title'
}
const COLOURS = {
  type: 'checkboxes',
  name: 'colours',
  options: [
    { value: 'red', text: 'Red' },
    { divider: 'or' },
    { value: 'blue', text: 'Blue' }
  ],
  required: 'Select at least one colour'
}
const WHERE = {
  type: 'radios',
  name: 'where',
  options: [
    { value: 'inside', text: 'Inside' },
    {
      value: 'outside',
      text: 'Outside',
      conditional: {
        type: 'text',
        name: 'address',
        required: 'Enter the address'
      }
    }
  ],
  required: 'Select where it is'
}
const STARTED = {
  type: 'date',
  name: 'startDate',
  dateName: 'The start date',
  required: 'Enter the start date'
}

const QUIET_REQUEST = { get: () => undefined }

function check(fields, body) {
  return checkAnswers(fields, readAnswers(body, fields), QUIET_REQUEST)
}

describe('reading a form post', () => {
  test('reads only the fields the page sends, trimmed, with the token allowed', () => {
    assert.deepEqual(
      readAnswers({ csrfToken: 'token', titleName: '  Cattle  ' }, [TITLE]),
      { titleName: 'Cattle' }
    )
  })

  test('reads a missing field as empty, and checkboxes as a list without repeats', () => {
    assert.deepEqual(readAnswers({}, [TITLE, COLOURS]), {
      titleName: '',
      colours: []
    })
    assert.deepEqual(
      readAnswers({ colours: ['red', 'red', 'blue'] }, [COLOURS]).colours,
      ['red', 'blue']
    )
  })

  test('reads a date as its day, month and year, and a conditional question with its parent', () => {
    assert.deepEqual(
      readAnswers(
        {
          'startDate-day': '1',
          'startDate-month': '2',
          'startDate-year': '2025',
          where: 'outside',
          address: 'Field 1'
        },
        [STARTED, WHERE]
      ),
      {
        startDate: { day: '1', month: '2', year: '2025' },
        where: 'outside',
        address: 'Field 1'
      }
    )
  })

  for (const [scenario, body] of [
    ['a field no page sends', { titleName: 'x', isAdmin: 'yes' }],
    ['__proto__', JSON.parse('{"__proto__": {"polluted": "yes"}}')],
    ['a list where the page sends text', { titleName: ['a', 'b'] }],
    ['an object where the page sends text', { titleName: { a: 'b' } }],
    ['an object in a list of checkboxes', { colours: [{ a: 'b' }] }]
  ]) {
    test(`refuses a post with ${scenario}`, () => {
      assert.throws(
        () => readAnswers(body, [TITLE, COLOURS]),
        (error) => error instanceof TamperedFormError && error.status === 400
      )
      assert.equal({}.polluted, undefined)
    })
  }

  test('reads a post with no body as empty answers', () => {
    assert.deepEqual(readAnswers(undefined, [TITLE]), { titleName: '' })
  })
})

describe('checking answers', () => {
  test('gives back valid answers', () => {
    assert.deepEqual(
      check([TITLE, COLOURS], { titleName: 'Cattle', colours: 'red' }),
      { values: { titleName: 'Cattle', colours: ['red'] }, errors: [] }
    )
  })

  test('lists every problem at once, linking to each field', () => {
    assert.deepEqual(check([TITLE, COLOURS, WHERE], {}).errors, [
      { name: 'titleName', text: 'Enter a title', href: '#titleName' },
      {
        name: 'colours',
        text: 'Select at least one colour',
        href: '#colours'
      },
      { name: 'where', text: 'Select where it is', href: '#where' }
    ])
  })

  test('allows text up to the maximum length, and refuses one character more', () => {
    assert.deepEqual(check([TITLE], { titleName: '1234567890' }).errors, [])
    assert.deepEqual(check([TITLE], { titleName: '12345678901' }).errors, [
      {
        name: 'titleName',
        text: 'Title must be 10 characters or fewer',
        href: '#titleName'
      }
    ])
  })

  test('runs a field check only on a non-empty answer', () => {
    const address = {
      type: 'text',
      name: 'address',
      check: (value) => (value.startsWith('https://') ? undefined : 'Bad')
    }

    assert.deepEqual(check([address], { address: '' }).values, {
      address: undefined
    })
    assert.equal(check([address], { address: 'ftp://x' }).errors[0].text, 'Bad')
    assert.deepEqual(check([address], { address: 'https://x' }).errors, [])
  })

  test('refuses a choice that is not an option, so a changed form saves nothing', () => {
    const { errors } = check([WHERE], { where: 'on the moon' })

    assert.deepEqual(errors, [
      { name: 'where', text: 'Select where it is', href: '#where' }
    ])
  })

  test('refuses an unknown choice on an optional question too', () => {
    const optional = { ...COLOURS, required: undefined }

    assert.equal(
      check([optional], { colours: ['red', 'green'] }).errors[0].text,
      'Select one of the options'
    )
    assert.deepEqual(check([optional], {}).values, { colours: undefined })
  })

  test('checks a conditional question only when its option is chosen', () => {
    assert.deepEqual(check([WHERE], { where: 'inside', address: '' }), {
      values: { where: 'inside' },
      errors: []
    })
    assert.deepEqual(check([WHERE], { where: 'outside', address: '' }).errors, [
      { name: 'address', text: 'Enter the address', href: '#address' }
    ])
  })
})

describe('dates (the GOV.UK Dates pattern)', () => {
  const parts = (day, month, year) => ({ day, month, year })

  test('gives a real date as YYYY-MM-DD', () => {
    assert.deepEqual(parseDate(parts('1', '2', '2025'), STARTED), {
      value: '2025-02-01'
    })
    assert.deepEqual(parseDate(parts('29', '2', '2024'), STARTED), {
      value: '2024-02-29'
    })
  })

  test('accepts month names in full or shortened to 3 letters or more', () => {
    for (const month of ['February', 'feb', 'FEBR']) {
      assert.deepEqual(parseDate(parts('3', month, '2025'), STARTED), {
        value: '2025-02-03'
      })
    }
  })

  test('says which parts are missing, and links to the first', () => {
    assert.deepEqual(parseDate(parts('', '2', ''), STARTED), {
      error: 'The start date must include a day and year',
      part: 'day'
    })
    assert.deepEqual(parseDate(parts('1', '', '2025'), STARTED), {
      error: 'The start date must include a month',
      part: 'month'
    })
  })

  test('says a date must be real', () => {
    for (const [day, month, year] of [
      ['29', '2', '2025'],
      ['31', '4', '2025'],
      ['1', '13', '2025'],
      ['1', 'fe', '2025'],
      ['1', '2', '25'],
      ['x', '2', '2025'],
      ['0', '2', '2025']
    ]) {
      assert.deepEqual(
        parseDate(parts(day, month, year), STARTED),
        { error: 'The start date must be a real date', part: 'day' },
        `${day} ${month} ${year}`
      )
    }
  })

  test('asks for a required date, and allows an optional one to be empty', () => {
    assert.deepEqual(parseDate(parts('', '', ''), STARTED), {
      error: 'Enter the start date',
      part: 'day'
    })
    assert.deepEqual(
      parseDate(parts('', '', ''), { ...STARTED, required: undefined }),
      { value: undefined }
    )
  })

  test('links a date error to the part to correct', () => {
    assert.deepEqual(
      check([STARTED], {
        'startDate-day': '1',
        'startDate-month': '',
        'startDate-year': '2025'
      }).errors,
      [
        {
          name: 'startDate',
          text: 'The start date must include a month',
          href: '#startDate-month'
        }
      ]
    )
  })
})
