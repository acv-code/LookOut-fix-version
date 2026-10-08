/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Definitions of the generated TNEF samples in test/samples/generated/.
 *
 * Run `npm run make-samples` to (re)write them. The test suite checks that
 * the committed files match these definitions byte by byte.
 */

import {
  buildPdf,
  buildTnef,
  encodeSingleByte,
} from "./tnef-writer.mjs";

const ascii = text => Uint8Array.from(text, c => c.charCodeAt(0));
const utf8 = text => new TextEncoder().encode(text);

export const GENERATED_SAMPLES = [
  {
    // Classic Outlook: 8 bit names in the OEM code page (Western, 1252).
    file: "cp1252-pdf-tildes.dat",
    tnef: () => buildTnef({
      codePage: 1252,
      attachments: [
        {
          title: encodeSingleByte("Presupuesto año 2026.pdf", 1252),
          longFilename8: encodeSingleByte("Presupuesto año 2026.pdf", 1252),
          mimeTag: "application/pdf",
          data: buildPdf("Presupuesto 2026"),
        },
        {
          title: encodeSingleByte("Información técnica.txt", 1252),
          data: utf8("Línea con eñe y acentos: áéíóú ÁÉÍÓÚ ü Ü ñ Ñ ¿? ¡!\n"),
        },
      ],
    }),
    expected: [
      { name: "Presupuesto año 2026.pdf", type: "application/pdf" },
      { name: "Información técnica.txt", type: "text/plain" },
    ],
  },
  {
    // Modern Outlook: 8.3 title plus a PT_UNICODE long file name, no MIME tag.
    file: "unicode-longname-pdf.dat",
    tnef: () => buildTnef({
      codePage: 1252,
      attachments: [
        {
          title: ascii("CONTRA~1.PDF"),
          longFilenameUnicode: "Contrato señor Muñoz – ÁÉÍÓÚÜ.pdf",
          extension: ".pdf",
          data: buildPdf("Contrato"),
        },
        {
          title: ascii("~1.PDF"),
          longFilenameUnicode: "日本語の資料.pdf",
          data: buildPdf("Shiryo"),
        },
      ],
    }),
    expected: [
      { name: "Contrato señor Muñoz – ÁÉÍÓÚÜ.pdf", type: "application/pdf" },
      { name: "日本語の資料.pdf", type: "application/pdf" },
    ],
  },
  {
    // Some gateways put UTF-8 into the 8 bit properties regardless of the
    // declared code page.
    file: "utf8-in-string8.dat",
    tnef: () => buildTnef({
      codePage: 1252,
      attachments: [
        {
          title: utf8("Año_ñandú.pdf"),
          longFilename8: utf8("Año_ñandú.pdf"),
          data: buildPdf("Nandu"),
        },
      ],
    }),
    expected: [
      { name: "Año_ñandú.pdf", type: "application/pdf" },
    ],
  },
  {
    // Non Latin single byte code page (Cyrillic, 1251).
    file: "cp1251-cyrillic.dat",
    tnef: () => buildTnef({
      codePage: 1251,
      attachments: [
        {
          title: encodeSingleByte("Отчёт.pdf", 1251),
          data: buildPdf("Otchet"),
        },
      ],
    }),
    expected: [
      { name: "Отчёт.pdf", type: "application/pdf" },
    ],
  },
  {
    // Two attachments with the same name must both be available, and the
    // renamed one must keep its extension.
    file: "duplicate-names.dat",
    tnef: () => buildTnef({
      codePage: 1252,
      attachments: [
        {
          title: encodeSingleByte("Copia de seguridad.pdf", 1252),
          data: buildPdf("Uno"),
        },
        {
          title: encodeSingleByte("Copia de seguridad.pdf", 1252),
          data: buildPdf("Dos"),
        },
      ],
    }),
    expected: [
      { name: "Copia de seguridad.pdf", type: "application/pdf" },
      { name: "Copia de seguridad (1).pdf", type: "application/pdf" },
    ],
  },
  {
    // An empty attachment must neither stop decoding nor get lost.
    file: "empty-file.dat",
    tnef: () => buildTnef({
      codePage: 1252,
      attachments: [
        {
          title: encodeSingleByte("vacío.txt", 1252),
          data: new Uint8Array(0),
        },
        {
          title: encodeSingleByte("Acta de la reunión.pdf", 1252),
          data: buildPdf("Acta"),
        },
      ],
    }),
    expected: [
      { name: "vacío.txt", type: "text/plain" },
      { name: "Acta de la reunión.pdf", type: "application/pdf" },
    ],
  },
];
