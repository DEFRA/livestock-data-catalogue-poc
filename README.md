# livestock-data-catalogue-poc

A prototype of the Livestock Data Catalogue, built with the [GOV.UK Prototype Kit](https://github.com/alphagov/govuk-prototype-kit) and [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend), and run on Defra's Core Delivery Platform (CDP).

The catalogue will hold metadata about livestock data: what each data asset holds, who is responsible for it and how to get it. This prototype tests the first journey, "find and view a data asset", with users before it is built in the frontend service, [livestock-data-catalogue-ui](https://github.com/DEFRA/livestock-data-catalogue-ui).

> [!WARNING]
> Prototype code is throwaway. Tested designs are rebuilt in the frontend service: no code is copied from here. The prototype is not designed to be resilient, secure or performant, and every value in its data is made up.

- [The prototype](#the-prototype)
  - [Pages](#pages)
  - [Data](#data)
  - [Code](#code)
- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Running the prototype](#running-the-prototype)
- [Linting, formatting and tests](#linting-formatting-and-tests)
- [Branching and pull requests](#branching-and-pull-requests)
- [Prototype exceptions](#prototype-exceptions)
- [GOV.UK Prototype Kit and GOV.UK Frontend](#govuk-prototype-kit-and-govuk-frontend)
- [Branding](#branding)
- [Setting a password](#setting-a-password)
- [Setting multiple passwords](#setting-multiple-passwords)
- [Removing the need for a password](#removing-the-need-for-a-password)
- [Npm scripts](#npm-scripts)
- [Updating dependencies](#updating-dependencies)
- [Environment Variables and Secrets](#environment-variables-and-secrets)
  - [Local development](#local-development)
  - [Environment Variables on CDP](#environment-variables-on-cdp)
  - [Environment Variables in the GOV.UK Prototype Kit](#environment-variables-in-the-govuk-prototype-kit)
  - [Secrets](#secrets)
- [Creating a secret](#creating-a-secret)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Debug docker](#debug-docker)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## The prototype

### Pages

| Address                                                                 | Page                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                     | Home: search, and browse by domain, by organisation and by recently updated                                                                                                                 |
| `/data-assets`                                                          | Search data assets, with filters for type, domain, category, owning organisation and delivery group. Accepts `q`, `type`, `domain`, `category`, `organisation`, `delivery-group` and `page` |
| `/data-assets/DA11111`                                                  | A data asset: its metadata, the people and organisations responsible for it, its security classification, its distributions and related data assets                                         |
| `/report-a-problem`, `/accessibility-statement`, `/cookies`, `/privacy` | Support pages, linked from every page. They open without signing in                                                                                                                         |
| `/sign-in`, `/sign-out`, `/signed-out`                                  | Signing in with the prototype's password, signing out, and the page that says you have signed out. See [Signing in](#signing-in)                                                            |
| `/health`                                                               | For CDP's health check: answers `{"message":"success"}` without signing in, and reads no data                                                                                               |

Only published and deprecated data assets are shown. Draft and retired ones, unknown addresses and malformed identifiers show Page not found.

### Signing in

On CDP, where `NODE_ENV` is `production`, every page asks you to sign in first, except the support pages. This is the password protection CDP turns on for every prototype, so nobody finds the prototype by accident and mistakes it for a real service.

- **The password** is the `PASSWORD` secret in the CDP Portal, as the [CDP prototype guide](https://github.com/DEFRA/cdp-documentation/blob/main/how-to/protoypes.md) describes. Research rounds can have passwords of their own: list their secret names in `PASSWORD_KEYS`, for example `PASSWORD_01`, and remove them when the round ends. There are no usernames, and the prototype stores no credentials. Each password must be at least 16 characters, for example 3 or 4 random words: a shorter one can't be used to sign in, and the logs say so.
- **The sign-in page** has the Defra layout. The Kit's own password page breaks Defra's branding rules (it uses GDS Transport and the title "GOV.UK Prototype Kit"), and it can't be changed. So [app/config.json](./app/config.json) turns the Kit's own check off (`"useAuth": false`), and [app/lib/sign-in.js](./app/lib/sign-in.js) checks the same secrets instead. It sets its own cookie, and never accepts the Kit's `authentication` cookie.
- **The cookie** is `prototype-sign-in`. It is `HttpOnly`, `Secure` and `SameSite=Lax`, and lasts 8 hours. It holds the time you signed in, a random part and an HMAC-SHA256 signature, never the password or a hash of it. The server checks the signature and the time, so a copied cookie stops working after 8 hours too.
- **The signing key** comes from the passwords through scrypt. So every copy of the prototype on CDP accepts the same cookies, no extra secret is needed, and changing a password signs everyone out. Signing out removes the cookie from your browser; changing the password is the only way to stop a copied cookie before it expires.
- **Wrong passwords**: after 10 in a minute from one address, every password from that address is refused for the rest of the minute, with status 429. On CDP, requests come through the platform's proxy, so until CDP tells us how many proxies there are, everyone shares one limit: a run of wrong passwords stops new sign-ins for up to a minute, but people who have signed in can carry on.
- **Without a password of 16 characters or more**, the prototype lets nobody in and logs that the `PASSWORD` secret is missing.
- **Logs**: every sign-in, sign-out and wrong password is one ECS JSON line in CDP's logs, with CDP's request ID, so a run of wrong passwords shows up. No line holds a password, a cookie or personal data.
- **On your computer** you don't need to sign in, because `NODE_ENV` isn't `production`. To try signing in, run the prototype as CDP does, with a made-up password:

  ```bash
  NODE_ENV=production USE_HTTPS=false PASSWORD=made-up-local-password npm start
  ```

- **The Kit's management pages** (`/manage-prototype`) show Page not found when `NODE_ENV` is `production`. There they only say to run the prototype locally, but the Kit's password page and its clear-data page still worked without our sign-in. Our router can't run before the Kit's, so [app/filters.js](./app/filters.js), which the Kit loads first, closes them with [app/lib/kit-pages.js](./app/lib/kit-pages.js). They still work on your computer.
- `USE_AUTH=false` turns signing in off, as CDP documents. Don't set `USE_AUTH=true` on CDP: the Kit's own check would send everyone to its password page, which is closed, so nobody could sign in.

The real catalogue will use Microsoft Entra ID for staff sign-in, as Defra's security standard requires. That is for the frontend service, not this prototype.

### Data

There is no database. The prototype reads the JSON files in [app/data/catalogue](./app/data/catalogue) once at start-up. Each file is one future MongoDB collection, shaped like model V0.11 from the Phase 1 stories. The [data README](./app/data/catalogue/README.md) describes each file, its sources and how to change the data safely.

The data contract is in [schemas/catalogue](./schemas/catalogue): a Joi schema for each collection, the rules that span records, and the publication checks in story S26. The tests check every record against it.

### Code

- [app/routes.js](./app/routes.js) maps addresses to the handlers in [app/lib/handlers](./app/lib/handlers).
- [app/lib](./app/lib) reads the data, decides what is visible, searches and builds what each page shows. Its functions are small and have no side effects, apart from reading the data at start-up.
- [app/views](./app/views) has the Nunjucks templates. Every component is rendered with its GOV.UK Frontend macro.
- [test](./test) has the tests, run with Node's built-in test runner.

The code is ES modules. The Kit loads `app/routes.js` and `app/filters.js` with `require()`, which Node.js 24 supports for ES modules.

## Requirements

### Node.js

Install [Node.js](http://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `>= v11`. You will find it easier to use
the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd livestock-data-catalogue-poc
nvm use
```

## Running the prototype

```bash
nvm use
npm ci
npm run dev
```

Then open http://localhost:3000. You don't need to sign in on your computer: the prototype asks for a password only when `NODE_ENV` is `production`, as it is on CDP (see [Signing in](#signing-in)). If the Kit asks whether to send usage data to GDS, answer no: the prototype shares nothing with third parties.

## Linting, formatting and tests

```bash
npm run lint
npm run format:check
npm test
```

- **Unit tests** cover the data contract, search, browsing and the data asset page, with a fixed date so they don't depend on when they run. They also check that every made-up address in the mock data uses a domain reserved for examples.
- **Page tests** load the Kit's app with `USE_AUTH=false` on a random port, and read the HTML with jsdom.
- **Accessibility tests** run axe-core's WCAG 2.2 AA rules on every page state. jsdom can't measure colour contrast, so check contrast, keyboard use, zoom and screen readers by hand.
- **Stylesheet tests** compile the Sass with the Kit's own copy of Sass, in the Kit's order, and check the branding: no GDS Transport, Helvetica, and Defra's colour as the brand colour.
- `npm test` fails if coverage of lines, branches or functions falls below 90%, and writes `coverage/lcov.info`.

The [pull request checks](./.github/workflows/check-pull-request.yml) run the same commands, a build of the production image, and a scan of that image. The dependency review runs in a job of its own, because it's the only job that can write to the pull request. The scan ignores the findings listed in [`.trivyignore`](./.trivyignore), which are accepted until upstream fixes are released. Each one has an expiry date.

## Branching and pull requests

- Follow [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow): make every change on a branch named for its intent, and merge it with a pull request. Never commit to `main`.
- `main` is protected: changes need a pull request with 1 approval, and are squash merged. While the team has one developer, a repository admin may merge without an approval (see [Prototype exceptions](#prototype-exceptions)).
- While the team has one developer, all Phase 1 prototype work is in one draft pull request, with one commit for each piece of work and its Jira link.
- Commit messages have a subject of 50 characters or fewer, in the imperative, then a blank line and a body that says what changed and why, with the Jira link.
- Follow the [Defra software development standards](https://defra.github.io/software-development-standards/), and fill in the [pull request template](./.github/pull_request_template.md).

## Prototype exceptions

The prototype follows the Defra standards wherever it can. These rules can't apply to it, and are met in the services instead:

| Rule                                                              | Why it can't apply here                                                                                                                                                                                                                                                                                                    | Where it applies                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Hapi, never Express                                               | CDP's prototype template is the GOV.UK Prototype Kit, which is built on Express                                                                                                                                                                                                                                            | The frontend service              |
| Sass `@use`, not `@import`                                        | The Kit builds Sass with `@import`, so it imports our Sass files. Our own files load GOV.UK Frontend with `@use`                                                                                                                                                                                                           | The frontend service              |
| ECS logs with pino                                                | The Kit logs plain text to the console, which CDP collects. Our code writes ECS JSON lines to stdout without pino ([app/lib/log.js](./app/lib/log.js)): sign-ins, sign-outs, wrong passwords and unexpected errors, with CDP's request ID and no request data                                                              | The frontend and backend services |
| Port 8085                                                         | CDP's prototype template sets `PORT` to 3000 in its Dockerfile. The prototype listens on `PORT`, and answers `GET /health` there without signing in                                                                                                                                                                        | The frontend and backend services |
| Redis sessions and CSRF tokens                                    | The Kit manages sessions, and the prototype keeps nothing in them. The journey only reads data, with GET requests. Instead of CSRF tokens, signing in and out only count from the prototype's own pages or the address bar, checked with the browser's `Sec-Fetch-Site` header, so other sites can't sign people in or out | The frontend service              |
| Security headers on every response                                | Our pages send a Content Security Policy with a new nonce each time, `nosniff`, frame protection, a referrer policy, `no-store` and HSTS ([app/lib/handlers/page-defaults.js](./app/lib/handlers/page-defaults.js)). Files the Kit serves before our code runs, and the Kit's own error page, don't have them              | The frontend service              |
| Staff sign in with Microsoft Entra ID                             | A prototype for research, with made-up data that is already public, uses the password CDP gives every prototype. Research participants outside Defra have no Defra account                                                                                                                                                 | The frontend service              |
| A generic page for every error                                    | The Kit shows its own error page, with details of the error, for errors that happen before our code runs. Our code can't change this. Our own errors show a generic page                                                                                                                                                   | The frontend service              |
| SonarQube Cloud                                                   | The code is throwaway. The pull request checks still need 90% test coverage                                                                                                                                                                                                                                                | The frontend and backend services |
| Small, focused pull requests                                      | The team has one developer, who keeps all Phase 1 prototype work in one draft pull request, with one commit for each piece of work                                                                                                                                                                                         | Every repository                  |
| Every change is approved by another developer before it is merged | The team has one developer. Admins may merge without an approval, on a pull request only, and GitHub records each time. This needs an approved Defra exception, and ends when a second developer joins                                                                                                                     | Every repository                  |

## GOV.UK Prototype Kit and GOV.UK Frontend

The [GOV.UK Prototype Kit](https://github.com/alphagov/govuk-prototype-kit) is a tool for building interactive
prototypes that look like pages on GOV.UK, it provides components and styles from the
[GOV.UK Frontend](https://github.com/alphagov/govuk-frontend). Both are provided by the
[Government Digital Service (GDS)](https://www.gov.uk/government/organisations/government-digital-service), this
template provides both tools in a wrapper that runs on the Core Delivery Platform at Defra.

> [!NOTE]
> The `GOV.UK Prototype Kit` is built with [express.js](https://expressjs.com/). The `Node.js`
> applications [cdp-node-frontend-template](https://github.com/DEFRA/cdp-node-frontend-template)
> and [cdp-node-backend-template](https://github.com/DEFRA/cdp-node-backend-template) at Defra are built with
> [Hapi.js](https://hapi.dev/)

- For information on the `GOV.UK Prototype Kit` see https://prototype-kit.service.gov.uk/docs/
- For tutorials on how to use the `GOV.UK Prototype Kit`
  see https://prototype-kit.service.gov.uk/docs/tutorials-and-guides
- For help with the underlying `GOV.UK Frontend` see:
  - https://design-system.service.gov.uk/
  - https://github.com/alphagov/govuk-frontend

> [!WARNING]
> The `livestock-data-catalogue-poc` is not a production ready application, it is a tool for prototyping. It is not
> designed to be used in production or to be resilient, secure or performant, nor should it be. It is designed to be
> used for prototyping ideas and testing them with users. It's a great tool for prototyping GOV web applications.

## Branding

The catalogue is for Defra staff and isn't on GOV.UK, so it doesn't use GOV.UK branding: no crown, GOV.UK logotype, GDS Transport font, GOV.UK header or footer, or GOV.UK brand colours, and no "GOV.UK" in page titles. It follows [Defra's branding guidance for services not on GOV.UK](https://digital.defra.gov.uk/design/branding), which says they must use the Defra header, logo, footer and favicon, and Helvetica or Arial. It builds them with GOV.UK Frontend, following [Using GOV.UK Frontend without GOV.UK branding](https://frontend.design-system.service.gov.uk/using-govuk-frontend-without-govuk-branding/):

- **Header:** the Generic header with the class `app-generic-header--defra`, which makes it white, as on Defra's own digital service manual. It shows the Defra logo and the service name in Defra green ([app/views/layouts/main.html](./app/views/layouts/main.html)). Screen readers skip the logo and read the service name and the department's name. The service navigation has only the navigation, because the header has the service name.
- **Footer:** our own footer, with Defra's green top border, the support links and the Open Government Licence statement ([app/views/partials/app-footer.html](./app/views/partials/app-footer.html)).
- **Font and colour:** [app/assets/sass/settings.scss](./app/assets/sass/settings.scss) sets the font to Helvetica Neue, Helvetica or Arial, and the brand colour to Defra's contrast-safe organisation colour from GOV.UK Frontend. The browser theme colour is the same.
- **Logo and favicon:** [app/assets/images](./app/assets/images) has the Defra logo and favicons, copied unchanged from Defra's [digital service manual](https://github.com/DEFRA/service-manual-ui/tree/main/src/client/images). The logo includes the Royal Arms, which are Crown copyright and not covered by the Open Government Licence: only Defra services may use it.

## Setting a password

> [!CAUTION]
> Do not commit the `.env` file to GitHub, it is in the `.gitignore` file by default. Sensitive information such as a
> password can be provided to a prototype via the Secrets page of your prototype in the CDP Portal Frontend

Basic authentication is on by default in CDP environments for prototypes. This means you will need to set a password
for your prototype. Our [sign-in page](#signing-in) uses this secret. You can do this via your prototypes secrets tab in the Portal Frontend. For information on how to do
this, follow these steps:

1. Read the **Setting a password** section on https://prototype-kit.service.gov.uk/docs/publishing
1. Go to the CDP Portal Frontend
1. Log in
1. Navigate to your prototype on the services list page
1. Navigate to your prototypes `Secrets` tab
1. Add a secret with a name `PASSWORD` and a `value` of your choosing
1. Re-deploy your prototype for the new secrets to be made available to it

## Setting multiple passwords

The `GOV.UK Prototype Kit` has the ability to set up multiple passwords via secrets. For more information on how to do
this read the **If you want to create additional passwords** section on
https://prototype-kit.service.gov.uk/docs/publishing. To add a secret to an environment your prototype is running in
see [Creating a secret](#creating-a-secret)

## Removing the need for a password

By default, the `GOV.UK Prototype Kit` requires a password has been set on your prototype when it has been deployed to
an environment. If you would like to turn off this requirement you can do so by setting the following environment
variable:

```dotenv
ENV USE_AUTH=false
```

This can be set in `cdp-app-config` for instructions on how to do so
read [Environment Variables on CDP](#environment-variables-on-cdp).

## Npm scripts

| Script           | What it does                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`    | Runs the prototype at http://localhost:3000, rebuilding when files change                         |
| `npm start`      | Runs the prototype as it runs on CDP                                                              |
| `npm run lint`   | Lints JavaScript with neostandard and Sass with the GDS Stylelint rules                           |
| `npm run format` | Formats JavaScript, JSON and Markdown with Prettier. `format:check` checks without changing files |
| `npm test`       | Runs the tests with coverage, and fails below 90%                                                 |

## Updating dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

## Environment Variables and Secrets

Environment variables and Secrets are used to configure your prototype. Where you set them can be seen in the table
below.

| Type                                                      | Environment | Where to set them                                   |
| --------------------------------------------------------- | ----------- | --------------------------------------------------- |
| Sensitive secrets and Non-sensitive environment variables | local       | `.env` file                                         |
| Sensitive secrets                                         | CDP         | CDP Portal Frontend services secrets page           |
| Non-sensitive environment variables                       | CDP         | CDP App Config repository by raising a pull request |

### Local development

> [!CAUTION]
> Do not store passwords in GitHub. Sensitive information such as a password can be provided to a prototype via the
> secrets page in the CDP Portal Frontend. The `.env` file is for local development only.

To set environment variables and secrets locally copy the [.env.template](./.env.template) file to `.env` and add any
environment variables or secrets your local environment needs.

### Environment Variables on CDP

When your prototype is running on a CDP environment, E.g. `dev` or `ext-test`. You can set environment variables via a
GitHub pull request.

To add environment variables read - https://github.com/DEFRA/cdp-documentation/blob/main/how-to/config.md. This will
guide you to add non-sensitive environment variables to the https://github.com/DEFRA/cdp-app-config repository via a
pull request.

### Environment Variables in the GOV.UK Prototype Kit

The following environment variables are available in the `GOV.UK Prototype Kit`. For more information see
their https://prototype-kit.service.gov.uk/docs/ or https://github.com/alphagov/govuk-prototype-kit.

| Name            | Value     | Description                                                                                                           |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `PASSWORD`      | `string`  | The password for [signing in](#signing-in). Required on CDP, where it is a secret set in the CDP Portal. Never in Git |
| `PASSWORD_KEYS` | `string`  | Comma-separated names of secrets that hold extra passwords, for example research rounds                               |
| `USE_AUTH`      | `boolean` | `false` turns signing in off. Leave it unset on CDP, where signing in is on. The tests set it to `false`              |
| `PORT`          | `number`  | The port the prototype listens on. Defaults to `3000`                                                                 |

The prototype's own settings are in [app/config.json](./app/config.json): its service name, service navigation, and `useAutoStoreData` set to `false`, so the Kit doesn't copy query strings into the session.

### Secrets

To add sensitive environment variables know as secrets to your prototype. Add them via your prototypes secrets page on
the CDP Portal.

## Creating a secret

1. Go to the CDP Portal Frontend
1. Log in
1. Navigate to your prototype on the services list page
1. Navigate to your prototypes `Secrets` tab
1. Add a secret on your chosen environment with a `name` and `value` of your choosing
1. Re-deploy your prototype for the new secrets to be made available to it

## Docker

For the most part you will not need to be concerned with `docker` when running this prototype. Everything is set up and
your `docker` will automatically be built, published and pushed when you deploy a new version of your prototype via the
UI in the CDP Portal.

### Development image

Build:

```bash
docker build --target development --no-cache --tag livestock-data-catalogue-poc:development .
```

Run:

```bash
docker run -e PORT=3000 -p 3000:3000 livestock-data-catalogue-poc:development
```

### Production image

Build:

```bash
docker build --no-cache --tag livestock-data-catalogue-poc .
```

Run:

> Update the password field to your password

```bash
docker run -e PASSWORD=beepBoopBeep -e PORT=3000 -p 3000:3000 livestock-data-catalogue-poc
```

### Debug docker

To debug issues in docker and to have a look at the built docker container in the same way as when it runs on CDP. You
can run an interactive shell:

Build:

```bash
docker build --no-cache --tag livestock-data-catalogue-poc .
```

Run:

```bash
docker run -it --entrypoint /bin/ash livestock-data-catalogue-poc
```

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
