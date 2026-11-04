// S05: "DA + 5 characters from 1-9 and A-Z excluding I and L"
export const DATA_ASSET_IDENTIFIER_PATTERN = /^DA[1-9A-HJKM-Z]{5}$/

export function isDataAssetIdentifier(value) {
  return typeof value === 'string' && DATA_ASSET_IDENTIFIER_PATTERN.test(value)
}
