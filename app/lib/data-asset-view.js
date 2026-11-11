import { personKey } from './catalogue-data.js'
import { formatDate } from './formatting.js'
import { isDataAssetIdentifier } from './identifiers.js'
import { isCurrentOn } from './periods.js'
import { nameFor, referenceValue, referenceValues } from './reference-data.js'
import { searchHref } from './search.js'
import { dataAssetHref } from './summaries.js'
import { findVisibleDataAsset } from './visibility.js'

const BYTE_UNITS = [
  [1e9, 'GB'],
  [1e6, 'MB'],
  [1e3, 'KB']
]

const ONE_DECIMAL_PLACE = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 1
})

export function formatByteSize(bytes) {
  const [size, unit] = BYTE_UNITS.find(([unitSize]) => bytes >= unitSize) ?? [
    1,
    'bytes'
  ]
  return `${ONE_DECIMAL_PLACE.format(bytes / size)} ${unit}`
}

function isHttpsAddress(address) {
  return URL.canParse(address) && new URL(address).protocol === 'https:'
}

// Only https addresses become links, so data can never make a
// javascript: or other unsafe link
function addressRow(key, address) {
  if (address === undefined) {
    return undefined
  }
  return isHttpsAddress(address)
    ? { key, link: { href: address, text: address } }
    : { key, text: address }
}

function textRow(key, text) {
  return text === undefined ? undefined : { key, text: String(text) }
}

function dateRow(key, date) {
  return date === undefined ? undefined : { key, text: formatDate(date) }
}

function listRow(key, items) {
  return items?.length ? { key, items } : undefined
}

function rows(...candidates) {
  return candidates.filter(Boolean)
}

function timePeriod(start, end) {
  if (start && end) {
    return `${formatDate(start)} to ${formatDate(end)}`
  }
  if (start) {
    return `From ${formatDate(start)}`
  }
  return end ? `Until ${formatDate(end)}` : undefined
}

function lastReviewed(dataAsset) {
  if (!dataAsset.lastReviewedDate) {
    return undefined
  }
  const date = formatDate(dataAsset.lastReviewedDate)
  return dataAsset.lastReviewedByName
    ? `${date} by ${dataAsset.lastReviewedByName}`
    : date
}

function namesFor(catalogue, listName, codes) {
  return (codes ?? []).map((code) => nameFor(catalogue, listName, code))
}

// Pages are in English, so only a keyword in another language needs a
// lang attribute (WCAG 2.2 success criterion 3.1.2)
const PAGE_LANGUAGE_CODE = 'en'

function keywordItems(catalogue, keywordNames) {
  return (keywordNames ?? []).map((name) => {
    const languageCode = catalogue.keywordsByName.get(name)?.languageCode
    return languageCode && languageCode !== PAGE_LANGUAGE_CODE
      ? { text: name, lang: languageCode }
      : { text: name }
  })
}

function aboutSection(catalogue, dataAsset) {
  return {
    heading: 'About this data asset',
    rows: rows(
      textRow(
        'Data asset type',
        nameFor(catalogue, 'dataAssetTypes', dataAsset.dataAssetTypeCode)
      ),
      textRow('Domain', nameFor(catalogue, 'domains', dataAsset.domainCode)),
      listRow(
        'Categories',
        namesFor(catalogue, 'categories', dataAsset.categoryCodes)
      ),
      listRow('Keywords', keywordItems(catalogue, dataAsset.keywordNames)),
      textRow('Identifier', dataAsset.identifier),
      textRow('Version', dataAsset.versionNumber)
    )
  }
}

function coverageSection(catalogue, dataAsset) {
  return {
    heading: 'Coverage and dates',
    rows: rows(
      listRow(
        'Jurisdictions',
        namesFor(catalogue, 'jurisdictions', dataAsset.jurisdictionCodes)
      ),
      textRow('Spatial coverage', dataAsset.spatialCoverageDescription),
      textRow(
        'Time period',
        timePeriod(dataAsset.coverageStartDate, dataAsset.coverageEndDate)
      ),
      dateRow('Valid from', dataAsset.validFromDate),
      // Without a Valid To Date, a data asset is valid with no end date (S06)
      textRow(
        'Valid to',
        dataAsset.validToDate
          ? formatDate(dataAsset.validToDate)
          : 'No end date'
      ),
      textRow(
        'Update frequency',
        nameFor(catalogue, 'updateFrequencies', dataAsset.updateFrequencyCode)
      ),
      dateRow('Created', dataAsset.creationDate),
      dateRow('Accepted', dataAsset.acceptanceDate),
      dateRow('Last updated', dataAsset.modificationDate),
      dateRow('Metadata last updated', dataAsset.metadataDate),
      textRow('Last reviewed', lastReviewed(dataAsset)),
      dateRow('Next review', dataAsset.nextReviewDate)
    )
  }
}

// Each part of the address is encoded, so nothing in it can add recipients
// or text to the email
function mailtoHref(emailAddress) {
  const at = emailAddress.lastIndexOf('@')
  const localPart = encodeURIComponent(emailAddress.slice(0, at))
  const domain = encodeURIComponent(emailAddress.slice(at + 1))
  return `mailto:${localPart}@${domain}`
}

function currentPeople(catalogue, dataAsset, roleCode, today) {
  return (dataAsset.governanceAssignments ?? [])
    .filter(
      (assignment) =>
        assignment.governanceRoleCode === roleCode &&
        isCurrentOn(assignment, today)
    )
    .map((assignment) => {
      const person = catalogue.peopleByKey.get(
        personKey(assignment.personName, assignment.personEmailAddressReference)
      )
      return {
        name: person.name,
        organisationName: person.organisationName,
        emailAddress: person.emailAddressReference,
        emailHref: mailtoHref(person.emailAddressReference)
      }
    })
}

function peopleRow(key, people) {
  return people.length ? { key, people } : undefined
}

function currentCustodians(dataAsset, today) {
  return (dataAsset.custodians ?? [])
    .filter((period) => isCurrentOn(period, today))
    .map((period) => period.organisationName)
}

// Several organisations can be Data Custodians at once (S17)
function custodiansRow(organisationNames) {
  return organisationNames.length > 1
    ? listRow('Data custodians', organisationNames)
    : textRow('Data custodian', organisationNames[0])
}

function responsibilitySection(catalogue, dataAsset, today) {
  return {
    heading: 'Responsibility',
    rows: rows(
      {
        key: 'Owning organisation',
        link: {
          href: searchHref({
            selected: { organisation: [dataAsset.organisationName] }
          }),
          text: dataAsset.organisationName
        }
      },
      dataAsset.deliveryGroupName && {
        key: 'Delivery group',
        link: {
          href: searchHref({
            selected: { 'delivery-group': [dataAsset.deliveryGroupName] }
          }),
          text: dataAsset.deliveryGroupName
        }
      },
      peopleRow(
        'Data owner',
        currentPeople(catalogue, dataAsset, 'DATA_OWNER', today)
      ),
      peopleRow(
        'Data stewards',
        currentPeople(catalogue, dataAsset, 'DATA_STEWARD', today)
      ),
      custodiansRow(currentCustodians(dataAsset, today))
    )
  }
}

// S25: the security classification and retention period come from the
// information asset the data asset belongs to
function informationAssetRows(catalogue, dataAsset) {
  const informationAsset = catalogue.informationAssetsByName.get(
    dataAsset.informationAssetName
  )
  if (!informationAsset) {
    return []
  }
  const source = `From the information asset ${informationAsset.name}`
  return [
    {
      key: 'Security classification',
      text: nameFor(
        catalogue,
        'securityClassifications',
        informationAsset.securityClassificationCode
      ),
      source
    },
    {
      key: 'Retention period',
      text: informationAsset.retentionPeriodDescription,
      source
    }
  ]
}

function accessSection(catalogue, dataAsset) {
  return {
    heading: 'Access and use',
    rows: rows(
      textRow('Access rights', dataAsset.accessRightsDescription),
      textRow('Provenance', dataAsset.provenanceDescription),
      textRow('Creator', dataAsset.creatorReference),
      ...informationAssetRows(catalogue, dataAsset),
      textRow(
        'Lifecycle state',
        nameFor(
          catalogue,
          'dataAssetLifecycleStates',
          dataAsset.lifecycleStateCode
        )
      )
    )
  }
}

function formatName(catalogue, code) {
  const format = referenceValue(catalogue, 'distributionFormats', code)
  return format.mediaType ? `${format.name} (${format.mediaType})` : format.name
}

function licenceRow(catalogue, code) {
  const licence = referenceValue(catalogue, 'licences', code)
  const text = licence.versionNumber
    ? `${licence.name} ${licence.versionNumber}`
    : licence.name
  return licence.reference && isHttpsAddress(licence.reference)
    ? { key: 'Licence', link: { href: licence.reference, text } }
    : { key: 'Licence', text }
}

function distributionCard(catalogue, distribution) {
  return {
    name: distribution.name,
    rows: rows(
      textRow('Description', distribution.description),
      textRow(
        'Type',
        nameFor(
          catalogue,
          'distributionTypes',
          distribution.distributionTypeCode
        )
      ),
      textRow(
        'Access method',
        nameFor(catalogue, 'accessMethods', distribution.accessMethodCode)
      ),
      textRow(
        'Format',
        formatName(catalogue, distribution.distributionFormatCode)
      ),
      textRow(
        'Authentication',
        nameFor(
          catalogue,
          'authenticationMethods',
          distribution.authenticationMethodCode
        )
      ),
      licenceRow(catalogue, distribution.licenceCode),
      textRow('Version', distribution.versionNumber),
      textRow('Data service', distribution.dataServiceTitleName),
      addressRow('Access link', distribution.accessReference),
      addressRow('Download link', distribution.downloadReference),
      textRow('Broker', distribution.brokerReference),
      textRow('Topic', distribution.topicName),
      distribution.byteSizeQuantity === undefined
        ? undefined
        : { key: 'Size', text: formatByteSize(distribution.byteSizeQuantity) }
    )
  }
}

// A related data asset only shows when it's visible. An external
// resource only shows when its address is https.
function relatedLink(catalogue, relationship) {
  const target = relationship.targetResourceIdentifier
  if (isDataAssetIdentifier(target)) {
    const related = findVisibleDataAsset(catalogue, target)
    return (
      related && {
        href: dataAssetHref(related.identifier),
        text: related.titleName
      }
    )
  }
  return isHttpsAddress(target)
    ? { href: target, text: relationship.description ?? target }
    : undefined
}

function relatedGroups(catalogue, dataAsset) {
  return referenceValues(catalogue, 'relationshipTypes')
    .map((relationshipType) => ({
      heading: relationshipType.name,
      links: (dataAsset.relationships ?? [])
        .filter(
          (relationship) =>
            relationship.relationshipTypeCode === relationshipType.code
        )
        .map((relationship) => relatedLink(catalogue, relationship))
        .filter(Boolean)
    }))
    .filter((group) => group.links.length > 0)
}

function replacementFor(catalogue, dataAsset) {
  const replacedBy = (dataAsset.relationships ?? []).find(
    (relationship) => relationship.relationshipTypeCode === 'REPLACED_BY'
  )
  const replacement =
    replacedBy &&
    findVisibleDataAsset(catalogue, replacedBy.targetResourceIdentifier)
  return (
    replacement && {
      href: dataAssetHref(replacement.identifier),
      titleName: replacement.titleName
    }
  )
}

// Everything the data asset page shows: names rather than codes, and only
// the current Data Owner, Data Stewards and Data Custodians
export function dataAssetPage(catalogue, dataAsset, { today }) {
  return {
    titleName: dataAsset.titleName,
    description: dataAsset.description,
    isDeprecated: dataAsset.publicationStateCode === 'DEPRECATED',
    replacement: replacementFor(catalogue, dataAsset),
    sections: [
      aboutSection(catalogue, dataAsset),
      coverageSection(catalogue, dataAsset),
      responsibilitySection(catalogue, dataAsset, today),
      accessSection(catalogue, dataAsset)
    ],
    distributions: (dataAsset.distributions ?? []).map((distribution) =>
      distributionCard(catalogue, distribution)
    ),
    relatedGroups: relatedGroups(catalogue, dataAsset)
  }
}
