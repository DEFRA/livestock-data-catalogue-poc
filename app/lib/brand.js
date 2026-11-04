import { readFileSync } from 'node:fs'

const ORGANISATION_COLOURS = new URL(
  import.meta
    .resolve('govuk-frontend/dist/govuk/settings/_colours-organisations.scss')
)

// Reads an organisation's colour from GOV.UK Frontend rather than copying
// it, so the browser theme colour always matches the brand colour that
// app/assets/sass/settings.scss sets
export function organisationColour(
  organisation,
  coloursSass = readFileSync(ORGANISATION_COLOURS, 'utf8')
) {
  const pattern = new RegExp(
    `"${organisation}": \\(\\s*colour: #[0-9a-f]{6},\\s*contrast-safe: (#[0-9a-f]{6})`
  )
  const match = coloursSass.match(pattern)
  if (!match) {
    throw new Error(
      `GOV.UK Frontend has no contrast-safe colour for ${organisation}`
    )
  }
  return match[1]
}

export const DEFRA_COLOUR = organisationColour(
  'department-for-environment-food-rural-affairs'
)
