import { tnef_parse } from "./tnef.mjs";
import { resolveMimeType } from "./mime.mjs";

// Read binary strings in chunks, String.fromCharCode() has an argument limit.
const CHUNK_SIZE = 0x8000;

// Partially implements nsIInputStream.
// https://udn.realityripple.com/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIInputStream
class PseudoInputStream {
  constructor() {
    this.view = null;
    this.offset = 0;
  }

  async setFile(file) {
    let buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    this.view = new Uint8Array(buffer);
    this.offset = 0;
  }

  available() {
    return this.view.length - this.offset;
  }

  test(bytes) {
    if (this.available() < bytes) {
      throw new Error("Trying to read beyond the end of the arrayBuffer");
    }
  }

  readByteArray(bytes) {
    this.test(bytes);
    let byteArray = Array.from(
      this.view.subarray(this.offset, this.offset + bytes)
    );
    this.offset += bytes;
    return byteArray;
  }

  read8() {
    this.test(1);
    let rv = this.view[this.offset];
    this.offset += 1;
    return rv
  }

  readBytes(bytes) {
    this.test(bytes);
    let parts = [];
    for (let i = 0; i < bytes; i += CHUNK_SIZE) {
      let end = this.offset + Math.min(i + CHUNK_SIZE, bytes);
      parts.push(
        String.fromCharCode.apply(null, this.view.subarray(this.offset + i, end))
      );
    }
    this.offset += bytes;
    return parts.join("");
  }

  close() {
    //NOOP
  }
}

export class TnefExtractor {
  constructor() {
    this.mStream = new PseudoInputStream();
    this.files = [];
  }

  /**
   * Decodes a TNEF file (winmail.dat).
   *
   * @param {Blob|ArrayBuffer} file - the TNEF data
   * @param {object} prefs - see storage.mjs
   * @returns {File[]} the decoded files
   */
  async parse(file, prefs) {
    // The TNEF parser uses debug_level.
    prefs = { ...prefs, debug_level: prefs["debug_enabled"] ? 10 : 5 };

    await this.mStream.setFile(file);
    try {
      tnef_parse(this.mStream, null, this, prefs);
    } catch (error) {
      // Truncated or corrupt TNEF: keep what could be decoded so far.
      console.warn("LookOut: TNEF decoding stopped early", error);
    }
    return this.files;
  }

  onTnefFile(data, filename, content_type, length, date) {
    // Strip away path.
    filename = (filename || "").split('\\').pop().split('/').pop() || "attachment";

    // The data is a binary string, but we need an Uint8Array to not trigger
    // utf8 interpretation.
    let bytes = new Uint8Array(data.length);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = data.charCodeAt(i) & 0xFF;
    }
    this.files.push(new File([bytes], filename, {
      type: resolveMimeType(filename, content_type),
    }));
  }
}
