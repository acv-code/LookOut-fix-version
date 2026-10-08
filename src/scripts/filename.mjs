/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const MAX_LENGTH = 200;

// Characters not allowed in file names on common file systems (and rejected
// by downloads.download()), plus bidi controls, which can be used to fake a
// harmless looking extension.
const ILLEGAL_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

/**
 * Turns a decoded TNEF file name into a name which can safely be passed to
 * downloads.download(). Non-ASCII characters are kept.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  let clean = (name || "")
    .normalize("NFC")
    .replace(ILLEGAL_CHARS, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "");

  if (WINDOWS_RESERVED.test(clean)) {
    clean = `_${clean}`;
  }

  // Count code points, to not split surrogate pairs.
  let chars = Array.from(clean);
  if (chars.length > MAX_LENGTH) {
    let dot = chars.lastIndexOf(".");
    let extension = dot > 0 && chars.length - dot <= 16 ? chars.slice(dot) : [];
    clean = chars.slice(0, MAX_LENGTH - extension.length).concat(extension).join("");
  }

  return clean || "attachment";
}
