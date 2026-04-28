# fm-odata-js consumer example

A minimal demonstration of using `fm-odata-js` in a separate Node project via
a local `file:` dependency. Nothing fancy: it lists a few rows from each table
in the `Contacts` solution and prints the total counts.

This is exactly the setup you would use in any real project — just swap the
`file:` path for a published version once the library ships to npm.

## Test database

A ready-to-host FileMaker file is bundled at [`../Contacts.fmp12`](../Contacts.fmp12).
Host it on an FMS instance with the OData API enabled, then point the example
at it using the env vars below.

> **Default credentials:** `admin` / `admin`
>
> These exist purely for local testing. **Change them before hosting the file
> on any network you do not fully control.**

## Setup

```bash
cd examples/consumer-node
npm install
```

`npm install` symlinks the parent `fm-odata-js` package into
`node_modules/fm-odata-js`, so any rebuild of the library (`npm run build` in
the repo root) is immediately visible to this example.

## Run

The example reads FMS credentials from environment variables. The easiest way
is to reuse the repo root `.env`:

```bash
# Node 20.6+ can load .env natively
node --env-file=../../.env index.mjs

# Older Node: export the vars manually
export FM_ODATA_HOST=https://fms.example.com
export FM_ODATA_DATABASE=Contacts
export FM_ODATA_USER=your-fms-user
export FM_ODATA_PASSWORD=your-fms-password
export FM_ODATA_INSECURE_TLS=1   # only for self-signed LAN certs
node index.mjs
```

Expected output (rows will vary based on your data):

```text
[example] Connected to https://fms.example.com/Contacts

contact   total=0  first 0 row(s):

address   total=0  first 0 row(s):

email     total=0  first 0 row(s):

phone     total=0  first 0 row(s):

script    Ping => result="hello-from-fm-odata-js" error=0
```

## Scripts

The example also invokes a FileMaker script at database scope at the end of
the run. To exercise it, add a script to the `Contacts` solution that simply
echoes its parameter:

```
# Script: "Ping"
Exit Script [Text Result: Get(ScriptParameter)]
```

If the script is missing the example detects FileMaker error `104` and prints
a "skipping" line instead of failing. Override the name via
`FM_ODATA_PING_SCRIPT` if your script is called something else.

## TypeScript variant

If your consumer project uses TypeScript, the same code works verbatim — the
library ships `.d.ts` files alongside the bundle. Simply:

```ts
import { FMOData, basicAuth, type QueryResult } from 'fm-odata-js'

interface Contact {
  id: number
  first_name: string
  last_name: string
}

const db = new FMOData({ /* ... */ })
const result: QueryResult<Contact> = await db.from<Contact>('contact').top(5).get()
//    ^? QueryResult<Contact>
```

Autocomplete, type-checking, and go-to-definition all work out of the box.
