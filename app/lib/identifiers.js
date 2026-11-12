// S05: "DA + 5 characters from 1-9 and A-Z excluding I and L"
export const DATA_ASSET_IDENTIFIER_PATTERN = /^DA[1-9A-HJKM-Z]{5}$/

export function isDataAssetIdentifier(value) {
  return typeof value === 'string' && DATA_ASSET_IDENTIFIER_PATTERN.test(value)
}

// S05: identifiers are issued in sequence from DA11111 to DAZZZZZ, counting
// through 1-9 then A-Z, skipping I and L
const IDENTIFIER_CHARACTERS = '123456789ABCDEFGHJKMNOPQRSTUVWXYZ'
const IDENTIFIER_LENGTH = 5
const IDENTIFIER_COUNT = IDENTIFIER_CHARACTERS.length ** IDENTIFIER_LENGTH

function identifierNumber(identifier) {
  return [...identifier.slice(2)].reduce(
    (number, character) =>
      number * IDENTIFIER_CHARACTERS.length +
      IDENTIFIER_CHARACTERS.indexOf(character),
    0
  )
}

function identifierFor(number) {
  let characters = ''
  let remaining = number
  for (let position = 0; position < IDENTIFIER_LENGTH; position += 1) {
    characters =
      IDENTIFIER_CHARACTERS[remaining % IDENTIFIER_CHARACTERS.length] +
      characters
    remaining = Math.floor(remaining / IDENTIFIER_CHARACTERS.length)
  }
  return `DA${characters}`
}

// The identifier after the highest one already issued, or undefined when
// none remain. Identifiers are never reused, so the issued ones include
// deleted data assets.
export function nextDataAssetIdentifier(issuedIdentifiers) {
  const highest = Math.max(
    -1,
    ...[...issuedIdentifiers]
      .filter(isDataAssetIdentifier)
      .map(identifierNumber)
  )
  const next = highest + 1
  return next < IDENTIFIER_COUNT ? identifierFor(next) : undefined
}
