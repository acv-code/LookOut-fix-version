/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = path.join(TEST_DIR, "..", "src");
export const SAMPLES_DIR = path.join(TEST_DIR, "samples");

// In the extension, mapi_props.js is a classic script defining globals
// (see background.html). Load it the same way.
if (typeof globalThis.MAPI_ATTACH_LONG_FILENAME == "undefined") {
  vm.runInThisContext(
    fs.readFileSync(path.join(SRC_DIR, "scripts", "mapi_props.js"), "utf8"),
    { filename: "mapi_props.js" }
  );
}

const { TnefExtractor } = await import("../src/scripts/lookout.mjs");

export const DEFAULT_PREFS = {
  "attach_raw_mapi": false,
  "disable_filename_character_set": false,
  "replace_body": true,
  "strict_contenttype": true,
  "debug_enabled": false,
  "body_part_prefix": "body_part_",
};

/**
 * Decodes a TNEF file the same way the extension does.
 *
 * @param {Uint8Array|string} data - the TNEF bytes or a file path
 * @param {object} [prefs]
 * @returns {Promise<File[]>}
 */
export async function decode(data, prefs = {}) {
  if (typeof data == "string") {
    data = fs.readFileSync(data);
  }
  return new TnefExtractor().parse(new Blob([data]), {
    ...DEFAULT_PREFS,
    ...prefs,
  });
}

export async function bytesOf(file) {
  return new Uint8Array(await file.arrayBuffer());
}

export function latin1(bytes, start = 0, end = bytes.length) {
  return String.fromCharCode(...bytes.subarray(start, end));
}
