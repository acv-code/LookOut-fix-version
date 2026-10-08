/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sanitizeFilename } from "../src/scripts/filename.mjs";
import { guessMimeType, resolveMimeType } from "../src/scripts/mime.mjs";

describe("sanitizeFilename", () => {
  it("keeps non-ASCII characters", () => {
    for (let name of [
      "Presupuesto año 2026.pdf",
      "Contrato señor Muñoz – ÁÉÍÓÚÜ.pdf",
      "日本語の資料.pdf",
      "Отчёт.pdf",
    ]) {
      assert.equal(sanitizeFilename(name), name);
    }
  });

  it("normalizes to NFC", () => {
    // "n" + combining tilde
    assert.equal(sanitizeFilename("año.pdf"), "año.pdf");
  });

  it("replaces characters not allowed in file names", () => {
    assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j.pdf'), "a_b_c_d_e_f_g_h_i_j.pdf");
    assert.equal(sanitizeFilename("tab\there.txt"), "tab_here.txt");
  });

  it("removes bidi controls which could fake the extension", () => {
    assert.equal(sanitizeFilename("factura‮fdp.exe"), "factura_fdp.exe");
  });

  it("does not allow hidden files or path traversal", () => {
    assert.equal(sanitizeFilename("../../.bashrc"), "_.._.bashrc");
    assert.equal(sanitizeFilename(".hidden"), "hidden");
    assert.equal(sanitizeFilename("name. "), "name");
  });

  it("avoids reserved Windows device names", () => {
    assert.equal(sanitizeFilename("CON.txt"), "_CON.txt");
    assert.equal(sanitizeFilename("console.txt"), "console.txt");
  });

  it("shortens long names but keeps the extension", () => {
    let name = sanitizeFilename(`${"ñ".repeat(300)}.pdf`);
    assert.equal(Array.from(name).length, 200);
    assert.ok(name.endsWith("ñ.pdf"));
  });

  it("does not split surrogate pairs", () => {
    let name = sanitizeFilename("😀".repeat(250));
    assert.equal(Array.from(name).length, 200);
    assert.ok(name.isWellFormed());
  });

  it("never returns an empty name", () => {
    assert.equal(sanitizeFilename(""), "attachment");
    assert.equal(sanitizeFilename("..."), "attachment");
    assert.equal(sanitizeFilename(undefined), "attachment");
  });
});

describe("MIME types", () => {
  it("guesses types from the extension, case insensitive", () => {
    assert.equal(guessMimeType("Factura_22928333.PDF"), "application/pdf");
    assert.equal(guessMimeType("Información técnica.txt"), "text/plain");
    assert.equal(guessMimeType("no-extension"), null);
    assert.equal(guessMimeType("unknown.xyz"), null);
  });

  it("prefers the declared type unless it is generic", () => {
    assert.equal(resolveMimeType("a.bin", "image/png"), "image/png");
    assert.equal(resolveMimeType("a.pdf", "Application/PDF; name=a.pdf"), "application/pdf");
    assert.equal(resolveMimeType("a.pdf", null), "application/pdf");
    assert.equal(resolveMimeType("a.pdf", "application/octet-stream"), "application/pdf");
    assert.equal(resolveMimeType("a.pdf", "application/binary"), "application/pdf");
    assert.equal(resolveMimeType("a.xyz", null), "application/octet-stream");
  });
});
