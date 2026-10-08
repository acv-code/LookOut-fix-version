/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// TNEF attachments often carry no (or a generic) MIME type. Guess it from
// the file extension, so Thunderbird and the OS can handle the file.

const MIME_TYPES = {
  "7z": "application/x-7z-compressed",
  "bmp": "image/bmp",
  "csv": "text/csv",
  "doc": "application/msword",
  "docm": "application/vnd.ms-word.document.macroEnabled.12",
  "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "dot": "application/msword",
  "dotx": "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "eml": "message/rfc822",
  "gif": "image/gif",
  "gz": "application/gzip",
  "htm": "text/html",
  "html": "text/html",
  "ics": "text/calendar",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "json": "application/json",
  "mp3": "audio/mpeg",
  "mp4": "video/mp4",
  "msg": "application/vnd.ms-outlook",
  "odp": "application/vnd.oasis.opendocument.presentation",
  "ods": "application/vnd.oasis.opendocument.spreadsheet",
  "odt": "application/vnd.oasis.opendocument.text",
  "pdf": "application/pdf",
  "png": "image/png",
  "pps": "application/vnd.ms-powerpoint",
  "ppsx": "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "ppt": "application/vnd.ms-powerpoint",
  "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "rar": "application/vnd.rar",
  "rtf": "application/rtf",
  "svg": "image/svg+xml",
  "tif": "image/tiff",
  "tiff": "image/tiff",
  "txt": "text/plain",
  "vcf": "text/vcard",
  "wav": "audio/wav",
  "webp": "image/webp",
  "xls": "application/vnd.ms-excel",
  "xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "xml": "application/xml",
  "zip": "application/zip",
};

// Types which say nothing about the content.
const GENERIC_TYPES = [
  "",
  "application/binary",
  "application/octet-stream",
];

/**
 * Returns the MIME type for a file name, or null if unknown.
 *
 * @param {string} filename
 * @returns {string|null}
 */
export function guessMimeType(filename) {
  let dot = filename.lastIndexOf(".");
  if (dot == -1) {
    return null;
  }
  let extension = filename.slice(dot + 1).toLowerCase();
  return MIME_TYPES[extension] || null;
}

/**
 * Returns the best MIME type for a decoded file: the declared one, unless it
 * is missing or generic.
 *
 * @param {string} filename
 * @param {string} [declaredType]
 * @returns {string}
 */
export function resolveMimeType(filename, declaredType) {
  let type = (declaredType || "").toLowerCase().split(";")[0].trim();
  if (!GENERIC_TYPES.includes(type)) {
    return type;
  }
  return guessMimeType(filename) || "application/octet-stream";
}
