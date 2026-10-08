/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Minimal TNEF writer, used only to build test samples.
 *
 * It writes the same structure Outlook/Exchange produce for a message with
 * file attachments (see [MS-OXTNEF]):
 *
 *   signature, key,
 *   attTnefVersion, attOemCodepage, attMessageClass,
 *   for each attachment:
 *     attAttachRendData, attAttachTitle, attAttachData, attAttachment (MAPI)
 */

const TNEF_SIGNATURE = 0x223e9f78;

const LVL_MESSAGE = 0x01;
const LVL_ATTACHMENT = 0x02;

// TNEF attribute types.
const atpString = 0x0001;
const atpByte = 0x0006;
const atpDword = 0x0008;

// TNEF attribute ids.
const attTnefVersion = 0x9006;
const attOemCodepage = 0x9007;
const attMessageClass = 0x8008;
const attAttachRendData = 0x9002;
const attAttachTitle = 0x8010;
const attAttachData = 0x800f;
const attAttachment = 0x9005;

// MAPI property types and ids.
const PT_STRING8 = 0x001e;
const PT_UNICODE = 0x001f;
const PR_ATTACH_EXTENSION = 0x3703;
const PR_ATTACH_LONG_FILENAME = 0x3707;
const PR_ATTACH_MIME_TAG = 0x370e;

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  bytes(data) {
    let chunk = Uint8Array.from(data);
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  u8(value) {
    this.bytes([value & 0xff]);
  }

  u16(value) {
    this.bytes([value & 0xff, (value >>> 8) & 0xff]);
  }

  u32(value) {
    this.bytes([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ]);
  }

  pad4() {
    while (this.length % 4) {
      this.u8(0);
    }
  }

  toUint8Array() {
    let out = new Uint8Array(this.length);
    let offset = 0;
    for (let chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/**
 * Encodes a string into a single byte Windows code page, by inverting the
 * WHATWG decoder for that code page.
 */
export function encodeSingleByte(text, codePage) {
  let decoder = new TextDecoder(`windows-${codePage}`);
  let table = new Map();
  for (let byte = 0; byte < 256; byte++) {
    let chr = decoder.decode(new Uint8Array([byte]));
    if (!table.has(chr)) {
      table.set(chr, byte);
    }
  }
  return Uint8Array.from(text, chr => {
    if (!table.has(chr)) {
      throw new Error(`Character ${chr} not in code page ${codePage}`);
    }
    return table.get(chr);
  });
}

export function encodeUtf16le(text) {
  let out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out[i * 2] = text.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = text.charCodeAt(i) >>> 8;
  }
  return out;
}

function writeAttribute(writer, level, id, type, data) {
  writer.u8(level);
  writer.u16(id);
  writer.u16(type);
  writer.u32(data.length);
  writer.bytes(data);
  let checksum = 0;
  for (let byte of data) {
    checksum += byte;
  }
  writer.u16(checksum & 0xffff);
}

function writeMapiString(writer, propType, propId, bytes) {
  writer.u16(propType);
  writer.u16(propId);
  writer.u32(1); // number of values
  writer.u32(bytes.length);
  writer.bytes(bytes);
  writer.pad4();
}

/**
 * Builds the MAPI property block of an attachment.
 *
 * @param {object} props
 * @param {Uint8Array} [props.longFilename8] - PR_ATTACH_LONG_FILENAME as
 *   PT_STRING8, already encoded (without terminator).
 * @param {string} [props.longFilenameUnicode] - PR_ATTACH_LONG_FILENAME as
 *   PT_UNICODE.
 * @param {string} [props.mimeTag] - PR_ATTACH_MIME_TAG (PT_STRING8, ASCII).
 * @param {string} [props.extension] - PR_ATTACH_EXTENSION (PT_STRING8).
 */
function buildMapiProps(props) {
  let entries = [];
  let ascii = text => Uint8Array.from(text, c => c.charCodeAt(0));
  let withNull = (bytes, size = 1) => {
    let out = new Uint8Array(bytes.length + size);
    out.set(bytes);
    return out;
  };

  if (props.extension) {
    entries.push([PT_STRING8, PR_ATTACH_EXTENSION, withNull(ascii(props.extension))]);
  }
  if (props.longFilename8) {
    entries.push([PT_STRING8, PR_ATTACH_LONG_FILENAME, withNull(props.longFilename8)]);
  }
  if (props.longFilenameUnicode) {
    entries.push([
      PT_UNICODE,
      PR_ATTACH_LONG_FILENAME,
      withNull(encodeUtf16le(props.longFilenameUnicode), 2),
    ]);
  }
  if (props.mimeTag) {
    entries.push([PT_STRING8, PR_ATTACH_MIME_TAG, withNull(ascii(props.mimeTag))]);
  }

  let writer = new ByteWriter();
  writer.u32(entries.length);
  for (let [type, id, bytes] of entries) {
    writeMapiString(writer, type, id, bytes);
  }
  return writer.toUint8Array();
}

/**
 * Builds a TNEF stream.
 *
 * @param {object} message
 * @param {integer} message.codePage - value of attOemCodepage.
 * @param {string} [message.messageClass]
 * @param {object[]} message.attachments - each with:
 *   title (Uint8Array, attAttachTitle bytes without terminator),
 *   data (Uint8Array), and the MAPI props understood by buildMapiProps().
 * @returns {Uint8Array}
 */
export function buildTnef(message) {
  let writer = new ByteWriter();
  writer.u32(TNEF_SIGNATURE);
  writer.u16(0x0001); // legacy key

  let version = new ByteWriter();
  version.u32(0x00010000);
  writeAttribute(writer, LVL_MESSAGE, attTnefVersion, atpDword, version.toUint8Array());

  let codePage = new ByteWriter();
  codePage.u32(message.codePage);
  codePage.u32(0);
  writeAttribute(writer, LVL_MESSAGE, attOemCodepage, atpByte, codePage.toUint8Array());

  let messageClass = `${message.messageClass || "IPM.Note"}\0`;
  writeAttribute(
    writer,
    LVL_MESSAGE,
    attMessageClass,
    atpString,
    Uint8Array.from(messageClass, c => c.charCodeAt(0))
  );

  for (let attachment of message.attachments) {
    // attAttachRendData: attachment type (file), position, rendering, flags.
    let rend = new ByteWriter();
    rend.u16(0x0001);
    rend.u32(0xffffffff);
    rend.u16(0x0000);
    rend.u16(0x0000);
    rend.u32(0x00000000);
    writeAttribute(writer, LVL_ATTACHMENT, attAttachRendData, atpByte, rend.toUint8Array());

    if (attachment.title) {
      let title = new Uint8Array(attachment.title.length + 1);
      title.set(attachment.title);
      writeAttribute(writer, LVL_ATTACHMENT, attAttachTitle, atpString, title);
    }

    writeAttribute(writer, LVL_ATTACHMENT, attAttachData, atpByte, attachment.data);
    writeAttribute(writer, LVL_ATTACHMENT, attAttachment, atpByte, buildMapiProps(attachment));
  }

  return writer.toUint8Array();
}

/**
 * Builds a small but valid one page PDF showing the given ASCII text.
 */
export function buildPdf(text) {
  let stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  let objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  let offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  let xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, c => c.charCodeAt(0));
}
