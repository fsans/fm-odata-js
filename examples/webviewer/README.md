# fm-odata-js · Web Viewer demo

A **single, self-contained HTML page** that talks to a FileMaker Server OData
endpoint via [`fm-odata-js`](../../README.md). Designed to be embedded inside a
FileMaker Pro **Web Viewer**, but it also runs fine in any modern browser.

It connects to the bundled demo solution and shows the first 100 rows of each
table (`contact`, `email`, `address`, `phone`) in a tabbed grid.

## Two variants

| File                                           | Library source                                   | When to use                                                                 |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| [`index.html`](./index.html)                   | Loaded from jsDelivr CDN at runtime              | You have internet access and want the smallest file / easy updates.         |
| [`index-inline.html`](./index-inline.html)     | **Fully inlined** — no external JS requests      | Offline / air-gapped LAN, flaky networks, or stricter Web Viewer sandboxes. |

Both have identical UI and behavior.

## Quick start

1. **Host the test database.**
   - Upload [`../Contacts.fmp12`](../Contacts.fmp12) to your FileMaker Server.
   - In **Admin Console → Database Server → Configuration → OData**, make sure
     the **OData API is enabled**.
   - Open the database so it's available to clients.

2. **Load the page.**
   Open `index.html` directly in a browser, or drop its content into a
   FileMaker Web Viewer (either from a URL, a `data:` URL, or a calculated
   HTML string).

3. **Configure and connect.**
   Adjust the `Host` field to your FMS URL, then click
   **Connect & refresh all tables**.

   The demo ships pre-filled with:

   | Field    | Value                      |
   | -------- | -------------------------- |
   | Host     | `https://fms.example.com`  |
   | Database | `Contacts`                 |
   | User     | `admin`                    |
   | Password | `admin`                    |

   > 🔐 These credentials match the bundled `Contacts.fmp12` demo database.
   > **Change them before hosting on any network you don't fully control.**

## What it does

- Loads the minified `fm-odata-js` ESM bundle from jsDelivr
  (`https://cdn.jsdelivr.net/gh/fsans/fm-odata-js@v0.1.1/dist/fm-odata.esm.min.js`).
- Issues one OData `GET` per table with `$top=100&$count=true`.
- Renders each result as a sortable-friendly HTML table in its own tab,
  with per-tab row counts and friendly null rendering.
- Surfaces `FMODataError` details (HTTP status + FMS error code) inline when
  something fails.

## Embedding in a Web Viewer

The simplest path is to let the Web Viewer load the file over HTTPS (host it
on the same FMS, on a static site, or even inside a container field served via
the Data API). If you'd rather inline the HTML, copy the entire contents of
`index.html` into a calculation like:

```filemaker
"data:text/html;charset=utf-8," &
  Substitute ( CalculationReturningHtml ; [ "#" ; "%23" ] ; [ "&" ; "%26" ] )
```

Remember that Web Viewers run under an `fmp://` or `null` origin — your FMS
must either share the origin or send permissive CORS headers for the OData
endpoint.

## Troubleshooting

| Symptom                              | Likely cause                                              |
| ------------------------------------ | --------------------------------------------------------- |
| `status: loaded with errors` + 401   | Wrong user / password, or OData account lacks privileges. |
| `status: err` + network failure     | OData API not enabled on FMS, or host URL incorrect.      |
| 400 on count                         | Expected — library works around the FMS `/$count` quirk.  |
| TLS / certificate error in browser   | Self-signed FMS cert; accept it in the browser first.     |
