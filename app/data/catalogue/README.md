# Mock catalogue data

**Every value in these files is made up**, except organisation names, their websites and the licence addresses, which are real and public. People, email addresses, data assets, distributions and their web addresses are made up. Made-up addresses use only domains reserved for examples: `example.com` for email addresses and `example.org` for web addresses, so they can never reach anyone.

The prototype reads these files at start-up instead of a database. Each file holds one future MongoDB collection, shaped like the planned documents, so the backend can reuse it as seed data and test fixtures.

## Sources

1. The Phase 1 logical data model V0.11, in the "Logical Data Model" diagrams and acceptance criteria of the Phase 1 Jira stories S01 to S26 ([LDAT-181](https://eaflood.atlassian.net/browse/LDAT-181)). Entities, attributes, business keys, foreign keys and reference values follow them exactly.
2. The data architect's answers on [LDAT-235](https://eaflood.atlassian.net/browse/LDAT-235) (4 November 2026): Licence (S23), a mandatory Authentication Method (S22), the Security Classification codes (S25), and no exemptions, interim values or active states.
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
- **Keys** are V0.11's business keys: names, codes, and the data asset identifier, which matches `^DA[1-9A-HJKM-Z]{5}$` (S05). There are no internal identifiers: the backend adds them and links records by them (LDAT-235, answer 4).
- **Dates** are `YYYY-MM-DD` and date-times are `YYYY-MM-DDThh:mm:ssZ`, in UTC (ISO 8601). Files are UTF-8.
- **System attributes:** every record in the 6 core collections has `systemCreatedDateTime`, `systemCreatedByUserId`, `systemUpdatedDateTime` and `systemUpdatedByUserId` (LADU-DATA-001). The user IDs are made-up UUIDs.
- **Visibility:** only Published and Deprecated data assets are shown to catalogue users (S11). The files also hold a Draft (DA11112) and a Retired (DA11116) data asset, to test that they stay hidden.

## Provisional choices

These go beyond V0.11 until the data architect answers the open questions on LDAT-235:

- `9999-12-31` is "the agreed open-ended value" for Valid To Date (S06, question 7).
- A relationship target inside the catalogue is held as its data asset identifier, and anything else as an `https` address (S16, question 9).
- Digital, Data and Technology Services has the Organisation Type `GOVERNMENT_DEPARTMENT`, with Defra as its parent (S04, question 11).
- A data asset with no distribution can be published when its access rights include the words "no distribution is available" (S26).

## Changing the data

1. Edit the JSON. Use only codes and names from the stories, and only made-up people, with `example.com` email addresses and `example.org` web addresses.
2. Run `npm test`. The tests check every record against the data contract in [`schemas/catalogue`](../../../schemas/catalogue): each collection's schema, the rules that span records (unique keys, foreign keys, the organisation hierarchy, coherent dates and governance), and the publication checks in S26 for every Published and Deprecated data asset. They also check that every made-up address uses a domain reserved for examples.
3. Run `npm run format` before committing.
