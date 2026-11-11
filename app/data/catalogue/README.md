# Mock catalogue data

**Every value in these files is made up**, except organisation names, their websites and the licence addresses, which are real and public. People, email addresses, data assets, distributions and their web addresses are made up. Made-up addresses use only domains reserved for examples: `example.com` for email addresses and `example.org` for web addresses, so they can never reach anyone.

The prototype reads these files at start-up instead of a database. Each file holds one future MongoDB collection, shaped like the planned documents, so the backend can reuse it as seed data and test fixtures.

## Sources

1. The Phase 1 logical data model V0.11, in the "Logical Data Model" diagrams and acceptance criteria of the Phase 1 Jira stories S01 to S26 ([LDAT-181](https://eaflood.atlassian.net/browse/LDAT-181)). Entities, attributes, business keys, foreign keys and reference values follow them, except for the provisional choices below.
2. The data architect's answers on [LDAT-235](https://eaflood.atlassian.net/browse/LDAT-235) (4 November 2026): Licence (S23), a mandatory Authentication Method (S22), the Security Classification codes (S25), and no exemptions, interim values or active states. Later that day: an optional Valid To Date and Coverage Start and End Dates (S06), distribution names unique within a data asset (S18), and Digital, Data and Technology Services as a government department. By 11 November 2026: a Language Code on Keyword again (S14), keyword names unique ignoring case (S14), a Name on each Relationship Type (S16), at least 1 distribution before publishing (S26), and a draft can be retired without being published (S26).
3. LADU-DATA-001 for names, and the draft MongoDB profile in our review of it: plural camelCase collections and camelCase fields.

## Files

| File                               | Collection                 | Entity                                                                                                             | Stories       |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| `data-assets.json`                 | `dataAssets`               | Data Asset, with its link entities and distributions embedded                                                      | S05 to S26    |
| `organisations.json`               | `organisations`            | Organisation                                                                                                       | S01, S02      |
| `people.json`                      | `people`                   | Person                                                                                                             | S03           |
| `delivery-groups.json`             | `deliveryGroups`           | Delivery Group                                                                                                     | S04           |
| `data-services.json`               | `dataServices`             | Data Service                                                                                                       | S24           |
| `information-assets.json`          | `informationAssets`        | Information Asset                                                                                                  | S25           |
| `keywords.json`                    | `keywords`                 | Keyword                                                                                                            | S14           |
| `organisation-types.json`          | `organisationTypes`        | Organisation Type                                                                                                  | S02           |
| `data-asset-types.json`            | `dataAssetTypes`           | Data Asset Type                                                                                                    | S08           |
| `domains.json`                     | `domains`                  | Domain                                                                                                             | S09           |
| `data-asset-lifecycle-states.json` | `dataAssetLifecycleStates` | Data Asset Lifecycle State                                                                                         | S10           |
| `publication-states.json`          | `publicationStates`        | Publication State                                                                                                  | S11           |
| `categories.json`                  | `categories`               | Category                                                                                                           | S13           |
| `jurisdictions.json`               | `jurisdictions`            | Jurisdiction                                                                                                       | S15           |
| `data-asset-governance-roles.json` | `dataAssetGovernanceRoles` | Data Asset Governance Role                                                                                         | S17           |
| `distribution-types.json`          | `distributionTypes`        | Distribution Type                                                                                                  | S19           |
| `access-methods.json`              | `accessMethods`            | Access Method                                                                                                      | S20           |
| `distribution-formats.json`        | `distributionFormats`      | Distribution Format                                                                                                | S21           |
| `authentication-methods.json`      | `authenticationMethods`    | Authentication Method                                                                                              | S22           |
| `licences.json`                    | `licences`                 | Licence                                                                                                            | S23           |
| `code-lists.json`                  | none                       | The 3 code lists with no entity: update frequency (S12), relationship type (S16) and security classification (S25) | S12, S16, S25 |

## How the documents are shaped

- **Field names** are camelCase versions of the V0.11 attribute names, without the entity's own name: Data Asset "Title Name" is `titleName`, and a foreign key keeps the name it has in the diagram, such as `organisationName`.
- **Link entities and distributions** are embedded in their data asset: `categoryCodes`, `keywordNames`, `jurisdictionCodes`, `relationships`, `governanceAssignments`, `custodians` and `distributions`.
- **Keys** are V0.11's business keys: names, codes, and the data asset identifier, which matches `^DA[1-9A-HJKM-Z]{5}$` (S05). A distribution's key is its data asset and its name, so its name is unique within the data asset (S18). There are no internal identifiers: the backend adds them and links records by them (LDAT-235, answer 4).
- **Dates** are `YYYY-MM-DD` and date-times are `YYYY-MM-DDThh:mm:ssZ`, in UTC (ISO 8601). Files are UTF-8. A data asset with no `validToDate` is valid with no end date (S06).
- **Addresses** follow V0.11, which asks only for a valid URI (S01, S13, S15, S18, S23 and S24). Any scheme is allowed, such as `amqps` for an event broker, but an address must be absolute, with no spaces or control characters. The prototype only turns `https` addresses into links, so an address with any other scheme, such as `javascript:`, never becomes a link. Relationship targets are a provisional choice, described below.
- **System attributes:** every record in the 6 core collections has `systemCreatedDateTime`, `systemCreatedByUserId`, `systemUpdatedDateTime` and `systemUpdatedByUserId` (LADU-DATA-001). The user IDs are made-up UUIDs.
- **Visibility:** only Published and Deprecated data assets are shown to catalogue users (S11). The files also hold a Draft (DA11112) and a Retired (DA11116) data asset, to test that they stay hidden.
- **Publication checks:** every Published and Deprecated data asset passes the S26 checks, including at least 1 distribution. Draft and Retired data assets are not checked, because a draft can be retired without ever being published (LDAT-235, answer 22).
- **Keyword language:** each keyword has a `languageCode`, a 2-letter ISO 639-1 code such as `en` for English or `cy` for Welsh (LDAT-235, answer 18). The data asset page marks a keyword in any language other than English, so screen readers pronounce it correctly (WCAG 2.2 success criterion 3.1.2).

## Provisional choices

These go beyond V0.11, and stay until the data architect decides:

- A relationship target inside the catalogue is held as its data asset identifier, and anything else as an `https` address (S16). A relationship to another data asset holds its identifier, such as `DA11113`, not its title, such as "Livestock Holding" in S16's example. The data architect wants to test this with real data assets first (LDAT-235, question 9).
- A Memorandum of Understanding is held as the licence `MOU` (S23). The data architect is asking the data governance team whether an MOU is a licence, or an agreement that Phase 1a would record as an Access and Sharing Arrangement (LDAT-235, question 17).
- A data service's `serviceType` is free text, such as "REST API", as in V0.11 (S24). The data architect will decide later whether it becomes a code list (LDAT-235, question 10).
- DA1111C is deliberately not used, because S05 uses it as its example of a deleted identifier, which is never reused.

## Changing the data

1. Edit the JSON. Use only codes and names from the stories, and only made-up people, with `example.com` email addresses and `example.org` web addresses.
2. Run `npm test`. The tests check every record against the data contract in [`schemas/catalogue`](../../../schemas/catalogue): each collection's schema, the rules that span records (unique keys, foreign keys, the organisation hierarchy, coherent dates and governance), and the publication checks in S26 for every Published and Deprecated data asset. They also check that every made-up address uses a domain reserved for examples.
3. Run `npm run format` before committing.
