import { nameFor } from './reference-data.js'

// V0.11 has no summary attribute, so lists show the first sentence of the
// description instead
function firstSentence(text) {
  const end = text.indexOf('. ')
  return end === -1 ? text : text.slice(0, end + 1)
}

export function dataAssetHref(identifier) {
  return `/data-assets/${identifier}`
}

export function dataAssetSummary(catalogue, dataAsset) {
  return {
    href: dataAssetHref(dataAsset.identifier),
    titleName: dataAsset.titleName,
    summary: firstSentence(dataAsset.description),
    typeName: nameFor(catalogue, 'dataAssetTypes', dataAsset.dataAssetTypeCode),
    domainName: nameFor(catalogue, 'domains', dataAsset.domainCode),
    organisationName: dataAsset.organisationName,
    modificationDate: dataAsset.modificationDate,
    isDeprecated: dataAsset.publicationStateCode === 'DEPRECATED'
  }
}
