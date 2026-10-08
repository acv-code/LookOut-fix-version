/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { SAMPLES_DIR, bytesOf, decode, latin1 } from "./helpers.mjs";
import { GENERATED_SAMPLES } from "./tools/samples.mjs";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function assertIsPdf(file) {
  let bytes = await bytesOf(file);
  assert.equal(latin1(bytes, 0, 5), "%PDF-", `${file.name} starts like a PDF`);
  assert.match(latin1(bytes, bytes.length - 32), /%%EOF\s*$/, `${file.name} ends like a PDF`);
}

describe("generated samples (PDF, accents, ñ)", () => {
  for (let sample of GENERATED_SAMPLES) {
    let file = path.join(SAMPLES_DIR, "generated", sample.file);

    describe(sample.file, () => {
      it("matches its definition in test/tools/samples.mjs", () => {
        assert.deepEqual(
          new Uint8Array(fs.readFileSync(file)),
          sample.tnef(),
          "run `npm run make-samples` to update the committed sample"
        );
      });

      it("decodes the expected file names and types", async () => {
        let files = await decode(file);
        assert.deepEqual(
          files.map(f => ({ name: f.name, type: f.type })),
          sample.expected
        );
      });

      it("decodes valid PDF files", async () => {
        let files = await decode(file);
        for (let pdf of files.filter(f => f.type == "application/pdf")) {
          await assertIsPdf(pdf);
        }
      });
    });
  }

  it("keeps the attachment content byte exact", async () => {
    let [, text] = await decode(
      path.join(SAMPLES_DIR, "generated", "cp1252-pdf-tildes.dat")
    );
    assert.equal(
      await text.text(),
      "Línea con eñe y acentos: áéíóú ÁÉÍÓÚ ü Ü ñ Ñ ¿? ¡!\n"
    );
  });

  it("keeps the raw names if the character set conversion is disabled", async () => {
    let [pdf] = await decode(
      path.join(SAMPLES_DIR, "generated", "cp1252-pdf-tildes.dat"),
      { disable_filename_character_set: true }
    );
    assert.equal(pdf.name, "Presupuesto a\xf1o 2026.pdf");
  });

  it("does not leak file names between decoded messages", async () => {
    let file = path.join(SAMPLES_DIR, "generated", "duplicate-names.dat");
    let first = (await decode(file)).map(f => f.name);
    let second = (await decode(file)).map(f => f.name);
    assert.deepEqual(second, first);
  });
});

/*
 * Real Outlook/Exchange samples from Apache POI. The expected hashes were
 * cross-checked with an independent decoder (Python tnefparse).
 */
const POI_SAMPLES = {
  "quick-winmail.dat": [
    { name: "body_part_0.rtf", type: "application/rtf", size: 25528, sha256: "81f0340e47351ec2472303af15d31381169b0d9caad489d4b24383eb727671a0" },
    { name: "quick.doc", type: "application/msword", size: 19968, sha256: "1240639edc264abf046523eed4bd0a154b0c4e487a9ec8b74be9d0c51b7de124" },
    { name: "quick.html", type: "text/html", size: 428, sha256: "5e7daab0b3edcfeec62bbde2371c95fc4fe7099469448abcee94cd49ffba072e" },
    { name: "quick.pdf", type: "application/pdf", size: 18638, sha256: "263bea348ce44185f191b32efee29be44ef7ef7cc45ed32b9ae6753b1103d7d0" },
    { name: "quick.txt", type: "text/plain", size: 235, sha256: "becf39adaa5a3526600ed1d443b5fd382e9879c219a08d183c0660382c59fb56" },
    { name: "quick.xml", type: "application/xml", size: 143, sha256: "cc1704ac3bf0c4b83388c4e1912bbca08cc4dadcfc551521112b55794770a20c" },
  ],
  "bug52400-winmail-with-attachments.dat": [
    { name: "body_part_0.html", type: "text/html", size: 672, sha256: "12dd0029bf8d79666e4fabd7dceaeb68cbf30e669c99a766f67ac0bf15bd61c4" },
    { name: "scion_tc_2007_maintenanceguide.pdf", type: "application/pdf", size: 193258, sha256: "b617b1efa60d79c40fbb6f201446ebce8d2fe4f9728c60ea9e2e64012ad6b26e" },
    { name: "Duke_Wave.png", type: "image/png", size: 122016, sha256: "7c02c7331088a3169246fb8aec7f9c4f85f9192122a6b80d6e09d219cd68ec77" },
  ],
  "winmail-sample1.dat": [
    { name: "body_part_0.rtf", type: "application/rtf", size: 443, sha256: "5dcd1bdee036cc1c7639bca7f7e96355d80a18f9e366b3be672a3112019d4356" },
    { name: "zappa_av1.jpg", type: "image/jpeg", size: 2937, sha256: "bea844f30e0fcc20fad419a0d11032a6465da93c1da185a1196949955994409a" },
    { name: "bookmark.htm", type: "text/html", size: 85805, sha256: "1e08d6e23c75ff80ac992eebc24c2943c7843b7dfee235966b37de5eb4362599" },
  ],
};

describe("Apache POI samples (real Outlook mails)", () => {
  for (let [sample, expected] of Object.entries(POI_SAMPLES)) {
    it(sample, async () => {
      let files = await decode(path.join(SAMPLES_DIR, "apache-poi", sample));
      let actual = [];
      for (let file of files) {
        actual.push({
          name: file.name,
          type: file.type,
          size: file.size,
          sha256: sha256(await bytesOf(file)),
        });
      }
      assert.deepEqual(actual, expected);

      for (let pdf of files.filter(f => f.type == "application/pdf")) {
        await assertIsPdf(pdf);
      }
    });
  }

  it("decodes the text attachment of quick-winmail.dat", async () => {
    let files = await decode(path.join(SAMPLES_DIR, "apache-poi", "quick-winmail.dat"));
    let text = await files.find(f => f.name == "quick.txt").text();
    assert.match(text, /^The quick brown fox jumps over the lazy dog/);
  });
});

describe("invalid input", () => {
  it("returns nothing for data which is not TNEF", async () => {
    assert.deepEqual(await decode(new TextEncoder().encode("%PDF-1.4 not tnef")), []);
  });

  it("returns the files decoded before the data was truncated", async () => {
    let sample = GENERATED_SAMPLES.find(s => s.file == "cp1252-pdf-tildes.dat");
    let tnef = sample.tnef();
    // Cut into the second attachment's data.
    let files = await decode(tnef.subarray(0, tnef.length - 60));
    assert.equal(files[0]?.name, "Presupuesto año 2026.pdf");
    await assertIsPdf(files[0]);
  });
});

/*
 * Additional samples, which can not be committed (license or privacy): every
 * *.tnef / *.dat file in the directories listed in LOOKOUT_TNEF_SAMPLES (and
 * in test/samples/external, see `npm run fetch-samples`) with a .list file
 * next to it, holding the expected file names, one per line.
 */
function externalSampleDirs() {
  let dirs = (process.env.LOOKOUT_TNEF_SAMPLES || "")
    .split(path.delimiter)
    .filter(Boolean);
  let external = path.join(SAMPLES_DIR, "external");
  if (fs.existsSync(external)) {
    dirs.push(external);
  }
  return dirs;
}

describe("external samples", () => {
  for (let dir of externalSampleDirs()) {
    for (let entry of fs.readdirSync(dir).sort()) {
      if (!/\.(tnef|dat)$/i.test(entry)) {
        continue;
      }
      let list = path.join(dir, entry.replace(/\.(tnef|dat)$/i, ".list"));
      if (!fs.existsSync(list)) {
        continue;
      }

      it(path.join(dir, entry), async () => {
        // The tnef project names message bodies <sample>-body.<ext>, LookOut
        // uses body_part_<n>.<ext>: compare the attachments only.
        let expected = fs.readFileSync(list, "utf8")
          .split(/\r?\n/)
          .filter(name => name && !/-body\.\w+$/.test(name));
        let files = await decode(path.join(dir, entry));
        let actual = files
          .map(f => f.name)
          .filter(name => !name.startsWith("body_part_"));
        assert.deepEqual(actual.sort(), expected.sort());
      });
    }
  }
});
