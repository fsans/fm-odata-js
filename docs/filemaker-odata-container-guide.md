# FileMaker OData API — Container Field Operations Guide

> **Source:** Claris FileMaker OData API Guide (FMS 22+)  
> **Scope:** All container field read/write operations available via OData v4  
> **Base URL pattern:** `https://{host}/fmi/odata/v4/{database-name}/{table-name}`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites & Authentication](#2-prerequisites--authentication)
3. [URL Structure Reference](#3-url-structure-reference)
4. [Operation 1 — Create a Record with a Container Field (POST)](#4-operation-1--create-a-record-with-a-container-field-post)
5. [Operation 2 — Update a Single Container Field via Binary Data (PATCH)](#5-operation-2--update-a-single-container-field-via-binary-data-patch)
6. [Operation 3 — Update One or More Container Fields via Base64 (PATCH)](#6-operation-3--update-one-or-more-container-fields-via-base64-patch)
7. [Choosing Between Binary and Base64](#7-choosing-between-binary-and-base64)
8. [Supported Media Types](#8-supported-media-types)
9. [FileMaker-Specific OData Annotations](#9-filemaker-specific-odata-annotations)
10. [Common Errors & Troubleshooting](#10-common-errors--troubleshooting)
11. [Complete Examples](#11-complete-examples)
12. [Quick-Reference Cheatsheet](#12-quick-reference-cheatsheet)

---

## 1. Overview

FileMaker container fields store binary objects — images, PDFs, audio, video, and arbitrary files. The OData v4 API exposes these fields and supports three distinct operations:

| Goal | HTTP Method | Encoding | Targets |
|------|-------------|----------|---------|
| Create a new record that includes container data | `POST` | Base64 in JSON body | One or more container fields |
| Update **one** container field in an existing record | `PATCH` | Raw binary in request body | Exactly one field (via URL path) |
| Update **one or more** container fields in an existing record | `PATCH` | Base64 in JSON body | One or more fields (alongside regular fields) |

The OData API does **not** support `PUT` for container updates. Always use `PATCH`.

---

## 2. Prerequisites & Authentication

### OData Access

OData must be enabled per-database on FileMaker Server. In FileMaker Server Admin Console:

- Go to **Databases** → select your database → **OData** tab → enable OData access.
- The account used must have the **fmrest** extended privilege set enabled.

### Authentication Header

All requests require HTTP Basic Authentication:

```
Authorization: Basic {base64(username:password)}
```

Example — credentials `admin:admin`:

```
Authorization: Basic YWRtaW46YWRtaW4=
```

> **Security note:** Always use HTTPS. FileMaker Server ships with a self-signed certificate by default; replace it with a trusted CA certificate for production. If testing with a self-signed cert, add `--insecure` to `curl` calls (not for production use).

### Required OData Headers

For all requests, include:

```
OData-Version: 4.0
OData-MaxVersion: 4.0
```

---

## 3. URL Structure Reference

### Base URL

```
https://{host}/fmi/odata/v4/{database-name}/{table-name}
```

### Record-level URL (for PATCH / DELETE)

```
https://{host}/fmi/odata/v4/{database-name}/{table-name}({primary-key-value})
```

- String primary keys: use single quotes → `Contacts('ALFKI')`
- Numeric primary keys: no quotes → `Contacts(42)`

### Field-level URL (binary PATCH only)

```
https://{host}/fmi/odata/v4/{database-name}/{table-name}({primary-key-value})/{field-name}
```

Example:

```
/fmi/odata/v4/ContactMgmt/Contacts('ALFKI')/Photo
```

### URL Component Glossary

| Placeholder | Description |
|---|---|
| `host` | FileMaker Cloud or FileMaker Server hostname |
| `v4` | OData version — always `v4` |
| `database-name` | Name of the hosted database file (without `.fmp12`) |
| `table-name` | Table occurrence name **or** FileMaker Table ID (FMTID) |
| `primary-key-value` | Value of the record's primary key field |
| `field-name` | Name of the container field |

---

## 4. Operation 1 — Create a Record with a Container Field (POST)

### Description

Creates a new record in a table. Container fields are populated using **base64-encoded data** embedded directly in the JSON body. You can create a record with both regular fields and container fields in a single request.

### Request

| Component | Value |
|---|---|
| Method | `POST` |
| URL | `https://{host}/fmi/odata/v4/{database}/{table}` |
| Content-Type | `application/json` |
| Body | JSON object with field values; container fields use base64 strings |

### JSON Body Structure

```json
{
  "PrimaryKey": "BJONES",
  "First Name": "Bob",
  "Last Name": "Jones",
  "Photo": "R0lGODlhCQAJAIABAH9/f////yH5BAEAAAEALAAAAAAJAAkAAAIMjI+pC+1wHkSOrbsKADs=",
  "Photo@com.filemaker.odata.Filename": "BJONES.png",
  "Photo@com.filemaker.odata.ContentType": "image/png"
}
```

### Key Points

- The container field value is a **base64-encoded string** of the file content.
- Two companion annotations accompany each container field:
  - `{FieldName}@com.filemaker.odata.Filename` — the filename stored in the container
  - `{FieldName}@com.filemaker.odata.ContentType` — the MIME type (e.g. `image/png`, `application/pdf`)
- **Media type inference:** Even if you provide the `ContentType` annotation, FileMaker also inspects the first bytes of the base64 data to confirm the media type. If there is a conflict, the sniffed type takes precedence.
- The POST body must represent **a single valid record** — batch record creation is not done this way (use the `$batch` endpoint for that).

### curl Example

```bash
curl --request POST \
  "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts" \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Basic YWRtaW46YWRtaW4=' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --data-raw '{
    "PrimaryKey": "BJONES",
    "First Name": "Bob",
    "Last Name": "Jones",
    "Photo": "R0lGODlhCQAJAIABAH9/f////yH5BAEAAAEALAAAAAAJAAkAAAIMjI+pC+1wHkSOrbsKADs=",
    "Photo@com.filemaker.odata.Filename": "BJONES.png",
    "Photo@com.filemaker.odata.ContentType": "image/png"
  }'
```

### Expected Response

- `201 Created` on success
- Response body contains the newly created record in JSON (OData format), including the system-assigned record ID

---

## 5. Operation 2 — Update a Single Container Field via Binary Data (PATCH)

### Description

Updates **exactly one** container field in an existing record by sending the raw binary file content in the request body. This is the most direct method and the only one where you can explicitly control the `Content-Type` per field.

### Request

| Component | Value |
|---|---|
| Method | `PATCH` |
| URL | `https://{host}/fmi/odata/v4/{database}/{table}({key})/{field-name}` |
| Content-Type | The MIME type of the file (e.g. `image/png`, `application/pdf`) |
| Content-Disposition | `inline; filename={filename}` |
| Body | Raw binary file data |

### Supported Binary Types

Only **image** and **PDF** types are supported for the binary PATCH method. This is a FileMaker-imposed constraint, not an OData standard limitation.

### curl Example

```bash
curl --request PATCH \
  "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts('ALFKI')/Photo" \
  --header 'Content-Type: image/png' \
  --header 'Authorization: Basic YWRtaW46YWRtaW4=' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --header 'Content-Disposition: inline; filename=ALFKI.png' \
  --data-binary '@photo.png'
```

### Sending Binary Data Programmatically

#### JavaScript (Node.js / Fetch)

```javascript
const fs = require('fs');

const fileBuffer = fs.readFileSync('./photo.png');

const response = await fetch(
  "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts('ALFKI')/Photo",
  {
    method: 'PATCH',
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename=ALFKI.png',
      'Authorization': 'Basic YWRtaW46YWRtaW4=',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
    },
    body: fileBuffer,
  }
);
```

#### Python (requests)

```python
import requests

url = "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts('ALFKI')/Photo"

with open('photo.png', 'rb') as f:
    response = requests.patch(
        url,
        data=f,
        headers={
            'Content-Type': 'image/png',
            'Content-Disposition': 'inline; filename=ALFKI.png',
            'Authorization': 'Basic YWRtaW46YWRtaW4=',
            'OData-Version': '4.0',
            'OData-MaxVersion': '4.0',
        }
    )

print(response.status_code)
```

### Key Points

- The URL path **must include the field name** as the last segment — this is how OData identifies which container field to update.
- You can only update **one field per request** with this method.
- The `Content-Disposition` header controls the filename stored inside the container.
- Use `inline; filename=...` (not `attachment`) as the disposition type.
- This method allows you to explicitly set the MIME type via `Content-Type`, unlike the base64 method.
- On success, returns `204 No Content`.

---

## 6. Operation 3 — Update One or More Container Fields via Base64 (PATCH)

### Description

Updates one or more container fields (and optionally regular fields) in an existing record using a JSON body with base64-encoded file content. Useful when you need to update multiple fields — including both container and non-container — in a single round trip.

### Request

| Component | Value |
|---|---|
| Method | `PATCH` |
| URL | `https://{host}/fmi/odata/v4/{database}/{table}({key})` |
| Content-Type | `application/json` |
| Body | JSON with base64 container values and/or regular field values |

### JSON Body Structure

```json
{
  "Photo": "R0lGODlhCQAJAIABAH9/f////yH5BAEAAAEALAAAAAAJAAkAAAIMjI+pC+1wHkSOrbsKADs=",
  "Photo@com.filemaker.odata.Filename": "ALFKI.png",
  "Photo@com.filemaker.odata.ContentType": "image/png",
  "Website": "www.example.com"
}
```

Notice that `Website` (a regular text field) is updated in the same request alongside the container field. This is the key advantage of this method over the binary PATCH.

### curl Example

```bash
curl --request PATCH \
  "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts('ALFKI')" \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Basic YWRtaW46YWRtaW4=' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --data-raw '{
    "Photo": "R0lGODlhCQAJAIABAH9/f////yH5BAEAAAEALAAAAAAJAAkAAAIMjI+pC+1wHkSOrbsKADs=",
    "Photo@com.filemaker.odata.Filename": "ALFKI.png",
    "Photo@com.filemaker.odata.ContentType": "image/png",
    "Website": "www.example.com"
  }'
```

### Generating Base64 in Various Languages

#### Bash / Shell

```bash
BASE64_DATA=$(base64 -i photo.png)
# On macOS: base64 -i photo.png
# On Linux: base64 photo.png
```

#### JavaScript (Node.js)

```javascript
const fs = require('fs');
const base64Data = fs.readFileSync('./photo.png').toString('base64');
```

#### JavaScript (Browser)

```javascript
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // strip data URI prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Usage with <input type="file">
const base64Data = await fileToBase64(inputElement.files[0]);
```

#### Python

```python
import base64

with open('photo.png', 'rb') as f:
    base64_data = base64.b64encode(f.read()).decode('utf-8')
```

### Updating Multiple Container Fields

You can update as many container fields as needed in one request, each with its own annotations:

```json
{
  "Photo": "{base64-image-data}",
  "Photo@com.filemaker.odata.Filename": "headshot.jpg",
  "Photo@com.filemaker.odata.ContentType": "image/jpeg",

  "Contract": "{base64-pdf-data}",
  "Contract@com.filemaker.odata.Filename": "contract-2025.pdf",
  "Contract@com.filemaker.odata.ContentType": "application/pdf",

  "Notes": "Updated contract and headshot on 2025-04-28"
}
```

### Key Points

- The URL points to the **record** (not a specific field) — the field names are inside the JSON body.
- MIME type is **inferred by FileMaker** from the first bytes of the base64 data; the `ContentType` annotation is a hint but not authoritative.
- If FileMaker misidentifies the media type, switch to the binary PATCH method (Operation 2), which lets you set `Content-Type` explicitly.
- On success, returns `204 No Content`.

---

## 7. Choosing Between Binary and Base64

| Factor | Binary PATCH (Op. 2) | Base64 PATCH (Op. 3) |
|---|---|---|
| Number of container fields per request | **1 only** | **Multiple** |
| Can also update regular fields in same request? | No | **Yes** |
| Explicit MIME type control | **Yes** (`Content-Type` header) | No (inferred from bytes) |
| Risk of MIME type misidentification | None | Possible |
| Payload size overhead | Minimal (raw binary) | ~33% larger (base64 encoding) |
| Supported file types | Images and PDFs only | Images and PDFs (same limit) |
| URL target | Field-level | Record-level |
| Best for | Single file upload, correct type guaranteed | Multi-field updates, mixed data+file updates |

**Rule of thumb:**

- Use **binary PATCH** when uploading a single file and type accuracy is critical (e.g. edge-case formats that base64 sniffing might misidentify).
- Use **base64 PATCH** when you need to update multiple fields or mix container and non-container field updates in one call.
- Use **POST with base64** only at record creation time.

---

## 8. Supported Media Types

FileMaker's OData container support is limited to specific binary formats. Based on official documentation, the supported types are:

| Category | MIME Type | Notes |
|---|---|---|
| PNG image | `image/png` | |
| JPEG image | `image/jpeg` | |
| GIF image | `image/gif` | |
| PDF document | `application/pdf` | |

> **Important:** Other file types (audio, video, arbitrary binary files, Office documents, etc.) are **not supported** via the OData API container operations. For those, use FileMaker Data API or upload through a FileMaker client directly.

FileMaker determines the media type by inspecting the **magic bytes** (file signature) at the start of the binary/base64 data — for example, PNG files start with `\x89PNG`, JPEG with `\xFF\xD8`, PDF with `%PDF`.

---

## 9. FileMaker-Specific OData Annotations

FileMaker extends the OData standard with custom annotations in the `com.filemaker.odata` namespace. For container fields, two annotations are defined:

### `{FieldName}@com.filemaker.odata.Filename`

- **Type:** String
- **Purpose:** Sets the filename stored inside the FileMaker container.
- **Example:** `"Photo@com.filemaker.odata.Filename": "headshot.png"`
- **Behaviour:** This is the name that appears in FileMaker when viewing the container. It does not need to match any actual file on disk.

### `{FieldName}@com.filemaker.odata.ContentType`

- **Type:** String (MIME type)
- **Purpose:** Declares the media type of the base64-encoded data.
- **Example:** `"Photo@com.filemaker.odata.ContentType": "image/png"`
- **Behaviour:** FileMaker uses this as a hint, but still performs byte-sniffing. If the declared type conflicts with the sniffed type, the sniffed type wins.

These annotations must accompany every container field value in POST and base64 PATCH requests. Omitting them may result in the file being stored without a proper filename or type classification.

---

## 10. Common Errors & Troubleshooting

### `400 Bad Request` — Invalid JSON body

- Check that your JSON is valid (no trailing commas, correct quoting).
- Ensure the base64 string has no line breaks or whitespace embedded in it. Some base64 encoders wrap at 76 characters — strip all newlines before sending.

```bash
# Strip newlines from base64 output on Linux
base64 photo.png | tr -d '\n'

# On macOS
base64 -i photo.png | tr -d '\n'
```

### `400 Bad Request` — Reserved field name

- The field name `id` (lowercase) is a reserved word in FileMaker OData. You cannot use it as a field name. Rename the field in FileMaker and republish.

### `404 Not Found`

- Verify the database name, table name, and primary key value.
- Confirm that OData access is enabled for that database and the account has the `fmrest` extended privilege.

### `415 Unsupported Media Type`

- For binary PATCH: the `Content-Type` header must be a supported MIME type (`image/png`, `image/jpeg`, `image/gif`, `application/pdf`).

### Media type misidentified (base64 PATCH)

- FileMaker inferred the wrong type from byte-sniffing. Switch to the **binary PATCH** method (Operation 2) and set `Content-Type` explicitly.

### `SSL certificate error` with curl

- Your server has a self-signed certificate. Add `--insecure` to your curl command for testing only. In production, install a valid SSL certificate on FileMaker Server.

### `204` returned but container appears empty in FileMaker

- The file was stored but FileMaker may not display it if the media type is unsupported. Confirm the file is an image or PDF.
- Check that the base64 data is complete and uncorrupted. Re-encode the file and retry.

---

## 11. Complete Examples

### Example A — Full workflow: Create a contact record with a profile photo

```bash
# 1. Encode the image
BASE64_PHOTO=$(base64 -i profile.png | tr -d '\n')

# 2. Create the record
curl --request POST \
  "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts" \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Basic YWRtaW46YWRtaW4=' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --data-raw "{
    \"PrimaryKey\": \"BJONES\",
    \"First Name\": \"Bob\",
    \"Last Name\": \"Jones\",
    \"Photo\": \"${BASE64_PHOTO}\",
    \"Photo@com.filemaker.odata.Filename\": \"BJONES.png\",
    \"Photo@com.filemaker.odata.ContentType\": \"image/png\"
  }"
```

### Example B — Update a contract PDF using binary PATCH

```bash
curl --request PATCH \
  "https://myhost.example.com/fmi/odata/v4/ContractDB/Contracts('CTR-2025-001')/ContractFile" \
  --header 'Content-Type: application/pdf' \
  --header 'Content-Disposition: inline; filename=contract-2025-001.pdf' \
  --header 'Authorization: Basic YWRtaW46YWRtaW4=' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --data-binary '@contract-2025-001.pdf'
```

### Example C — Update photo and website in one base64 PATCH

```bash
BASE64_PHOTO=$(base64 -i new-photo.jpg | tr -d '\n')

curl --request PATCH \
  "https://myhost.example.com/fmi/odata/v4/ContactMgmt/Contacts('ALFKI')" \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Basic YWRtaW46YWRtaW4=' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --data-raw "{
    \"Photo\": \"${BASE64_PHOTO}\",
    \"Photo@com.filemaker.odata.Filename\": \"ALFKI-updated.jpg\",
    \"Photo@com.filemaker.odata.ContentType\": \"image/jpeg\",
    \"Website\": \"https://www.example.com\"
  }"
```

### Example D — JavaScript full helper class

```javascript
class FileMakerODataContainers {
  constructor(host, database, credentials) {
    this.baseUrl = `https://${host}/fmi/odata/v4/${database}`;
    this.authHeader = 'Basic ' + btoa(`${credentials.user}:${credentials.password}`);
    this.defaultHeaders = {
      'Authorization': this.authHeader,
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
    };
  }

  // Operation 1: Create a record with container data
  async createRecordWithContainer(tableName, fields, containerField, fileBase64, fileName, mimeType) {
    const body = {
      ...fields,
      [containerField]: fileBase64,
      [`${containerField}@com.filemaker.odata.Filename`]: fileName,
      [`${containerField}@com.filemaker.odata.ContentType`]: mimeType,
    };

    const response = await fetch(`${this.baseUrl}/${tableName}`, {
      method: 'POST',
      headers: { ...this.defaultHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`POST failed: ${response.status} ${await response.text()}`);
    return response.json();
  }

  // Operation 2: Update a single container field with binary data
  async updateContainerBinary(tableName, primaryKey, fieldName, fileBuffer, mimeType, fileName) {
    const url = `${this.baseUrl}/${tableName}('${primaryKey}')/${fieldName}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...this.defaultHeaders,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename=${fileName}`,
      },
      body: fileBuffer,
    });

    if (!response.ok) throw new Error(`PATCH binary failed: ${response.status} ${await response.text()}`);
    return true; // 204 No Content on success
  }

  // Operation 3: Update one or more container fields with base64 data (+ optional regular fields)
  async updateContainersBase64(tableName, primaryKey, updates) {
    // updates: array of { fieldName, base64Data, fileName, mimeType }
    // plus optionally a regularFields object

    const body = {};

    for (const { fieldName, base64Data, fileName, mimeType } of updates.containers || []) {
      body[fieldName] = base64Data;
      body[`${fieldName}@com.filemaker.odata.Filename`] = fileName;
      body[`${fieldName}@com.filemaker.odata.ContentType`] = mimeType;
    }

    // Merge in regular (non-container) field updates
    Object.assign(body, updates.regularFields || {});

    const url = `${this.baseUrl}/${tableName}('${primaryKey}')`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...this.defaultHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`PATCH base64 failed: ${response.status} ${await response.text()}`);
    return true;
  }
}

// Usage
const client = new FileMakerODataContainers(
  'myhost.example.com',
  'ContactMgmt',
  { user: 'admin', password: 'admin' }
);

// Create record with photo
const base64 = btoa(/* binary data */);
await client.createRecordWithContainer(
  'Contacts',
  { 'PrimaryKey': 'CSMITH', 'First Name': 'Carol', 'Last Name': 'Smith' },
  'Photo', base64, 'carol.png', 'image/png'
);

// Update photo + website in one call
await client.updateContainersBase64('Contacts', 'CSMITH', {
  containers: [
    { fieldName: 'Photo', base64Data: newBase64, fileName: 'carol-new.jpg', mimeType: 'image/jpeg' }
  ],
  regularFields: { Website: 'https://carol.example.com' }
});
```

---

## 12. Quick-Reference Cheatsheet

```
╔══════════════════╦══════════════╦═════════════════════════╦══════════════════════════════════╗
║ Operation        ║ Method       ║ URL target              ║ Body                             ║
╠══════════════════╬══════════════╬═════════════════════════╬══════════════════════════════════╣
║ Create w/file    ║ POST         ║ /table                  ║ JSON with base64 field values    ║
║ Update 1 field   ║ PATCH        ║ /table(key)/fieldName   ║ Raw binary bytes                 ║
║ Update N fields  ║ PATCH        ║ /table(key)             ║ JSON with base64 field values    ║
╚══════════════════╩══════════════╩═════════════════════════╩══════════════════════════════════╝

Required headers (all operations):
  Authorization: Basic {base64(user:password)}
  OData-Version: 4.0
  OData-MaxVersion: 4.0

For JSON body operations:
  Content-Type: application/json

For binary PATCH:
  Content-Type: {mime-type of file}
  Content-Disposition: inline; filename={filename}

Container field annotations (JSON body):
  "{Field}@com.filemaker.odata.Filename": "filename.ext"
  "{Field}@com.filemaker.odata.ContentType": "mime/type"

Supported file types: image/png, image/jpeg, image/gif, application/pdf

Success responses:
  POST  → 201 Created  (body contains new record)
  PATCH → 204 No Content
```

---

*Guide compiled from official Claris FileMaker OData API documentation (FMS 22, OData v4).*  
*Last updated: April 2025*
