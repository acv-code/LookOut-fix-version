/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Writes the generated TNEF samples to test/samples/generated/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_SAMPLES } from "./samples.mjs";

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "samples",
  "generated"
);

fs.mkdirSync(dir, { recursive: true });
for (let sample of GENERATED_SAMPLES) {
  fs.writeFileSync(path.join(dir, sample.file), sample.tnef());
  console.log(`wrote ${sample.file}`);
}
