/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Runs background.js against a minimal fake of the Thunderbird WebExtension
 * APIs it uses (MV3 signatures).
 */

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

import { SAMPLES_DIR } from "./helpers.mjs";

const EXTENSION_URL = "moz-extension://lookout/";
const POPUP_SENDER = { id: "lookout", url: `${EXTENSION_URL}popup/popup.html` };

function createEvent() {
  let listeners = [];
  return {
    listeners,
    addListener: listener => listeners.push(listener),
    fire: (...args) => Promise.all(listeners.map(l => l(...args))),
  };
}

function createBrowser({ message, attachments, prefs = {} }) {
  let calls = {
    getAttachmentFile: [],
    enable: [],
    disable: [],
    badge: [],
    sendMessage: [],
    download: [],
  };
  let nextDownloadId = 1;

  let browser = {
    calls,
    i18n: { getMessage: key => `msg:${key}` },
    runtime: {
      id: "lookout",
      getURL: p => `${EXTENSION_URL}${p}`,
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
    },
    storage: {
      local: { get: async defaults => ({ ...defaults, ...prefs }) },
      onChanged: createEvent(),
    },
    scripting: {
      messageDisplay: {
        getRegisteredScripts: async () => [],
        registerScripts: async () => {},
      },
    },
    tabs: {
      query: async () => [],
      sendMessage: async (tabId, request) => calls.sendMessage.push({ tabId, request }),
    },
    messages: {
      get: async () => message,
      listAttachments: async () => attachments.map(({ file, ...a }) => a),
      getAttachmentFile: async (messageId, partName) => {
        calls.getAttachmentFile.push(partName);
        return attachments.find(a => a.partName == partName).file;
      },
    },
    messageDisplay: {
      onMessagesDisplayed: createEvent(),
      getDisplayedMessages: async () => ({ id: null, messages: [message] }),
    },
    messageDisplayAction: {
      enable: async tabId => calls.enable.push(tabId),
      disable: async tabId => calls.disable.push(tabId),
      setBadgeText: async details => calls.badge.push(details),
    },
    downloads: {
      onChanged: createEvent(),
      download: async options => {
        calls.download.push(options);
        return nextDownloadId++;
      },
    },
  };
  return browser;
}

function sampleFile(...parts) {
  return new File([fs.readFileSync(path.join(SAMPLES_DIR, ...parts))], "winmail.dat");
}

let loadCount = 0;
async function loadBackground(options) {
  let browser = createBrowser(options);
  globalThis.browser = browser;
  // A new module instance for every test.
  await import(`../src/background.js?instance=${loadCount++}`);
  return browser;
}

const TAB = { id: 7, type: "mail" };
const MESSAGE = { id: 42, subject: "Factura", junk: false, folder: { specialUse: ["inbox"] } };

function displayMessage(browser, message = MESSAGE) {
  return browser.messageDisplay.onMessagesDisplayed.fire(TAB, {
    id: null,
    messages: [message],
  });
}

function popupRequest(browser, request, sender = POPUP_SENDER) {
  let [listener] = browser.runtime.onMessage.listeners;
  return listener(request, sender);
}

describe("background", () => {
  let tnefAttachment;

  beforeEach(() => {
    tnefAttachment = {
      name: "winmail.dat",
      contentType: "application/ms-tnef",
      partName: "1.2",
      size: 1234,
      file: sampleFile("generated", "cp1252-pdf-tildes.dat"),
    };
  });

  it("enables the button and shows the number of decoded files", async () => {
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    await displayMessage(browser);

    assert.deepEqual(browser.calls.enable, [TAB.id]);
    assert.deepEqual(browser.calls.badge, [{ tabId: TAB.id, text: "2" }]);
  });

  it("disables the button for messages without TNEF", async () => {
    let browser = await loadBackground({
      message: MESSAGE,
      attachments: [{ name: "a.pdf", contentType: "application/pdf", partName: "1.2" }],
    });
    await displayMessage(browser);

    assert.deepEqual(browser.calls.disable, [TAB.id]);
    assert.deepEqual(browser.calls.getAttachmentFile, []);
  });

  it("lists the decoded files for the popup", async () => {
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    let data = await popupRequest(browser, { command: "getDecodedFiles", tabId: TAB.id });

    assert.equal(data.state, "ok");
    assert.equal(data.messageId, MESSAGE.id);
    assert.deepEqual(data.files.map(f => [f.name, f.type]), [
      ["Presupuesto año 2026.pdf", "application/pdf"],
      ["Información técnica.txt", "text/plain"],
    ]);
  });

  it("decodes a message only once", async () => {
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    await displayMessage(browser);
    await popupRequest(browser, { command: "getDecodedFiles", tabId: TAB.id });

    assert.deepEqual(browser.calls.getAttachmentFile, ["1.2"]);
  });

  it("downloads a decoded file with its Unicode name", async () => {
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    await popupRequest(browser, {
      command: "downloadFiles",
      messageId: MESSAGE.id,
      indices: [0],
      saveAs: true,
    });

    assert.equal(browser.calls.download.length, 1);
    let [options] = browser.calls.download;
    assert.equal(options.filename, "Presupuesto año 2026.pdf");
    assert.equal(options.saveAs, true);

    let blob = resolveObjectURL(options.url);
    let bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(String.fromCharCode(...bytes.subarray(0, 5)), "%PDF-");

    // The blob URL is released once the download is done.
    await browser.downloads.onChanged.fire({ id: 1, state: { current: "complete" } });
    assert.equal(resolveObjectURL(options.url), undefined);
  });

  it("downloads all files", async () => {
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    await popupRequest(browser, {
      command: "downloadFiles",
      messageId: MESSAGE.id,
      indices: [0, 1],
      saveAs: false,
    });

    assert.deepEqual(
      browser.calls.download.map(o => [o.filename, o.saveAs]),
      [["Presupuesto año 2026.pdf", false], ["Información técnica.txt", false]]
    );
  });

  it("ignores requests from content scripts", async () => {
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    let result = popupRequest(
      browser,
      { command: "downloadFiles", messageId: MESSAGE.id, indices: [0] },
      { id: "lookout", url: "imap://mail.example.com/INBOX?number=1", tab: TAB }
    );

    assert.equal(result, undefined);
    assert.deepEqual(browser.calls.download, []);
  });

  it("does not decode junk messages and shows a warning", async () => {
    let junk = { ...MESSAGE, junk: true };
    let browser = await loadBackground({ message: junk, attachments: [tnefAttachment] });
    await displayMessage(browser, junk);

    assert.deepEqual(browser.calls.getAttachmentFile, []);
    assert.deepEqual(browser.calls.sendMessage.map(m => m.request.command), [
      "showJunkTnefWarning",
    ]);
    let data = await popupRequest(browser, { command: "getDecodedFiles", tabId: TAB.id });
    assert.equal(data.state, "junk");
  });

  it("replaces the message body with the decoded HTML body", async () => {
    tnefAttachment.file = sampleFile("apache-poi", "bug52400-winmail-with-attachments.dat");
    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    await displayMessage(browser);

    let [{ request }] = browser.calls.sendMessage;
    assert.equal(request.command, "replaceMessageBody");
    assert.match(request.html, /<html>/);
    // The body is not listed as a file.
    assert.deepEqual(browser.calls.badge, [{ tabId: TAB.id, text: "2" }]);
  });

  it("only checks winmail.dat and TNEF content types in strict mode", async () => {
    tnefAttachment.name = "renamed.dat";
    tnefAttachment.contentType = "application/octet-stream";

    let browser = await loadBackground({ message: MESSAGE, attachments: [tnefAttachment] });
    await displayMessage(browser);
    assert.deepEqual(browser.calls.getAttachmentFile, []);

    browser = await loadBackground({
      message: MESSAGE,
      attachments: [tnefAttachment],
      prefs: { strict_contenttype: false },
    });
    await displayMessage(browser);
    assert.deepEqual(browser.calls.badge, [{ tabId: TAB.id, text: "2" }]);
  });
});
