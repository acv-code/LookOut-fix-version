/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Downloads the test data of the tnef project (https://github.com/verdammelt/tnef)
 * to test/samples/external/. It is GPL licensed, and therefore not committed.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "samples",
  "external"
);
const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "lookout-tnef-"));

try {
  execFileSync("git", [
    "clone", "--quiet", "--depth", "1",
    "https://github.com/verdammelt/tnef", checkout,
  ], { stdio: "inherit" });

  let source = path.join(checkout, "tests", "files", "datafiles");
  let baselines = path.join(checkout, "tests", "files", "baselines");
  fs.mkdirSync(target, { recursive: true });
  for (let entry of fs.readdirSync(source)) {
    if (!entry.endsWith(".tnef")) {
      continue;
    }
    fs.copyFileSync(path.join(source, entry), path.join(target, entry));

    // The baseline lists every file the tnef tool writes ("WRITING | name").
    let sample = entry.replace(/\.tnef$/, "");
    let baseline = path.join(baselines, `${sample}.baseline`);
    if (fs.existsSync(baseline)) {
      let names = fs.readFileSync(baseline, "utf8")
        .split(/\r?\n/)
        .filter(line => line.startsWith("WRITING\t|\t"))
        .map(line => line.split("\t|\t")[1]);
      fs.writeFileSync(path.join(target, `${sample}.list`), names.join("\n"));
    }
  }
  console.log(`Samples copied to ${target}`);
} finally {
  fs.rmSync(checkout, { recursive: true, force: true });
}
