# TNEF test samples

## `generated/`

Synthetic `winmail.dat` files written by `test/tools/make-samples.mjs`
(`npm run make-samples`), using the small TNEF writer in
`test/tools/tnef-writer.mjs`. They cover PDF attachments and file names with
accents and `ñ` in the different ways Outlook/Exchange store them:

| File | What it covers |
|---|---|
| `cp1252-pdf-tildes.dat` | 8 bit names in code page 1252, PDF with MIME tag, `.txt` without MIME tag |
| `unicode-longname-pdf.dat` | 8.3 title plus `PR_ATTACH_LONG_FILENAME` as `PT_UNICODE` (Spanish and Japanese) |
| `utf8-in-string8.dat` | UTF-8 bytes in 8 bit properties despite code page 1252 |
| `cp1251-cyrillic.dat` | Non Latin single byte code page |
| `duplicate-names.dat` | Two attachments with the same name |
| `empty-file.dat` | An empty attachment followed by a PDF |

They are licensed like the rest of LookOut (MPL 2.0).

## `apache-poi/`

Real `winmail.dat` files from the
[Apache POI](https://github.com/apache/poi/tree/trunk/test-data/hmef) test data,
licensed under the Apache License 2.0 (see `apache-poi/LICENSE-2.0.txt`).

    Apache POI
    Copyright 2003-2026 The Apache Software Foundation

    This product includes software developed at
    The Apache Software Foundation (https://www.apache.org/).

## More samples (not committed)

`npm test` additionally checks every `*.tnef` / `*.dat` file that has a
`.list` file next to it (one expected file name per line) in the directories
listed in the `LOOKOUT_TNEF_SAMPLES` environment variable (separated by the
platform's path delimiter):

- `npm run fetch-samples` downloads the test data of the
  [tnef project](https://github.com/verdammelt/tnef) (GPL 2, so it is not
  committed) to `test/samples/external/` and is picked up automatically.
- Private samples (for example real mails from users) should be kept outside
  of the repository and passed via `LOOKOUT_TNEF_SAMPLES`.
