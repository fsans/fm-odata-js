// Minimal fm-odata-js consumer.
//
// Reads FMS connection settings from environment variables and lists the
// first few rows from each expected table in the Contacts solution.
//
// Environment:
//   FM_ODATA_HOST              e.g. https://192.168.0.24
//   FM_ODATA_DATABASE          e.g. Contacts
//   FM_ODATA_USER              FMS account with OData privileges
//   FM_ODATA_PASSWORD          matching password
//   FM_ODATA_INSECURE_TLS=1    optional, for self-signed LAN certs
//   FM_ODATA_PING_SCRIPT       optional, name of a script to invoke at the
//                              end of the run (defaults to "Ping" if present;
//                              silently skipped if FMS reports it missing).
//
// Run:
//   npm install
//   node --env-file=../../.env index.mjs     # Node 20.6+
//   # or: export the vars yourself and: node index.mjs

import { FMOData, basicAuth, FMODataError, FMScriptError } from 'fm-odata-js'

const {
  FM_ODATA_HOST,
  FM_ODATA_DATABASE,
  FM_ODATA_USER,
  FM_ODATA_PASSWORD,
  FM_ODATA_INSECURE_TLS,
  FM_ODATA_PING_SCRIPT,
} = process.env

for (const [name, val] of Object.entries({
  FM_ODATA_HOST,
  FM_ODATA_DATABASE,
  FM_ODATA_USER,
  FM_ODATA_PASSWORD,
})) {
  if (!val) {
    console.error(`Missing env var: ${name}`)
    process.exit(1)
  }
}

// For self-signed certs on LAN FMS boxes. DEV ONLY.
if (FM_ODATA_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  console.warn('[example] TLS verification disabled (dev only).')
}

const db = new FMOData({
  host: FM_ODATA_HOST,
  database: FM_ODATA_DATABASE,
  token: basicAuth(FM_ODATA_USER, FM_ODATA_PASSWORD),
  timeoutMs: 15_000,
})

console.log(`[example] Connected to ${FM_ODATA_HOST}/${FM_ODATA_DATABASE}\n`)

for (const table of ['contact', 'address', 'email', 'phone']) {
  try {
    const { value, count } = await db.from(table).top(3).count().get()
    console.log(`${table.padEnd(8)}  total=${count ?? '?'}  first ${value.length} row(s):`)
    for (const row of value) {
      const keys = Object.keys(row).slice(0, 4).join(', ')
      console.log(`  {${keys}${Object.keys(row).length > 4 ? ', ...' : ''}}`)
    }
  } catch (err) {
    if (err instanceof FMODataError) {
      console.log(`${table.padEnd(8)}  ERROR ${err.status} ${err.code ?? ''} ${err.message}`)
    } else {
      throw err
    }
  }
  console.log()
}

// --- Script demo ----------------------------------------------------------
// Calls a FileMaker script at database scope and prints its result. Add a
// script named "Ping" (or set FM_ODATA_PING_SCRIPT) to your solution that
// does:  Exit Script [Text Result: Get(ScriptParameter)]
const scriptName = FM_ODATA_PING_SCRIPT ?? 'Ping'
try {
  const { scriptResult, scriptError } = await db.script(scriptName, {
    parameter: 'hello-from-fm-odata-js',
  })
  console.log(`script    ${scriptName} => result=${JSON.stringify(scriptResult)} error=${scriptError}`)
} catch (err) {
  if (err instanceof FMScriptError && err.scriptError === '104') {
    console.log(`script    ${scriptName} not present in this solution (FM error 104) — skipping`)
  } else if (err instanceof FMODataError) {
    console.log(`script    ${scriptName} HTTP ${err.status} ${err.code ?? ''} ${err.message}`)
  } else {
    throw err
  }
}
