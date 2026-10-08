import { TnefExtractor } from "./scripts/lookout.mjs";
import { sanitizeFilename } from "./scripts/filename.mjs";
import * as storage from "./scripts/storage.mjs";

const TNEF_SIGNATURE = [0x78, 0x9f, 0x3e, 0x22];
const TNEF_CONTENT_TYPES = ["application/ms-tnef", "application/vnd.ms-tnef"];
const MESSAGE_SCRIPT_ID = "lookout-message-display";

// Decoded messages, keyed by message id. The background is an event page, so
// this cache is lost when it is suspended and simply rebuilt on demand.
const MAX_CACHED_MESSAGES = 10;
const decodedMessages = new Map();

// Blob URLs of running downloads, keyed by download id.
const downloadUrls = new Map();

/*
 * All listeners have to be registered synchronously, so they wake up the
 * event page.
 */
browser.messageDisplay.onMessagesDisplayed.addListener(handleMessagesDisplayed);
browser.runtime.onMessage.addListener(handleRuntimeMessage);
browser.downloads.onChanged.addListener(handleDownloadChanged);
browser.storage.onChanged.addListener(() => decodedMessages.clear());
browser.runtime.onInstalled.addListener(handleAlreadyDisplayedMessages);
browser.runtime.onStartup.addListener(handleAlreadyDisplayedMessages);

registerMessageDisplayScript();

async function registerMessageDisplayScript() {
  try {
    let registered = await browser.scripting.messageDisplay.getRegisteredScripts({
      ids: [MESSAGE_SCRIPT_ID],
    });
    if (registered.length == 0) {
      await browser.scripting.messageDisplay.registerScripts([
        {
          id: MESSAGE_SCRIPT_ID,
          js: ["message-content-script.js"],
        },
      ]);
    }
  } catch (error) {
    console.error("LookOut: unable to register message display script", error);
  }
}

function isTnefAttachment(attachment, prefs) {
  if (!prefs["strict_contenttype"]) {
    // Every attachment is checked for the TNEF signature.
    return true;
  }
  let name = (attachment.name || "").toLowerCase();
  let contentType = (attachment.contentType || "")
    .toLowerCase().split(";")[0].trim();
  return name == "winmail.dat" || TNEF_CONTENT_TYPES.includes(contentType);
}

async function hasTnefSignature(file) {
  let bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return TNEF_SIGNATURE.every((byte, i) => bytes[i] == byte);
}

/**
 * Decodes all TNEF attachments of a message.
 *
 * @param {integer} messageId
 * @returns {object} with
 *   junk: true if the message was not processed because it is junk,
 *   files: decoded File objects,
 *   body: the decoded HTML body (if it should replace the displayed one).
 */
async function decodeMessage(messageId) {
  let prefs = await storage.getPrefs();
  let attachments = (await browser.messages.listAttachments(messageId))
    .filter(attachment => isTnefAttachment(attachment, prefs));
  let result = { junk: false, files: [], body: null };
  if (attachments.length == 0) {
    return result;
  }

  let message = await browser.messages.get(messageId);
  if (message.junk || message.folder?.specialUse?.includes("junk")) {
    console.log("LookOut: TNEF processing cancelled for junk message");
    result.junk = true;
    return result;
  }

  for (let attachment of attachments) {
    let file = await browser.messages.getAttachmentFile(
      messageId,
      attachment.partName
    );
    if (!await hasTnefSignature(file)) {
      continue;
    }

    let tnefFiles = await new TnefExtractor().parse(file, prefs);
    for (let tnefFile of tnefFiles) {
      /*
       * TNEF can contain the original HTML message body.
       *
       * Keep the decoded body separate so it can replace the body
       * Thunderbird displayed from the MIME message.
       */
      if (
        tnefFile.name == `${prefs["body_part_prefix"]}0.html` &&
        prefs["replace_body"] &&
        result.body === null
      ) {
        try {
          result.body = await tnefFile.text();
          continue;
        } catch (error) {
          console.error("LookOut: unable to read TNEF message body", error);
        }
      }
      result.files.push(tnefFile);
    }
  }

  return result;
}

function getDecodedMessage(messageId) {
  let decoded = decodedMessages.get(messageId);
  if (decoded) {
    // Mark as recently used.
    decodedMessages.delete(messageId);
  } else {
    decoded = decodeMessage(messageId);
    // Do not cache failures.
    decoded.catch(() => decodedMessages.delete(messageId));
  }
  decodedMessages.set(messageId, decoded);

  while (decodedMessages.size > MAX_CACHED_MESSAGES) {
    decodedMessages.delete(decodedMessages.keys().next().value);
  }
  return decoded;
}

async function sendToMessageDisplay(tab, request) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await browser.tabs.sendMessage(tab.id, request);
      return;
    } catch (error) {
      if (attempt == 9) {
        console.error(`LookOut: unable to send ${request.command}`, error);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

async function updateAction(tab, decoded) {
  let count = decoded ? decoded.files.length : 0;
  if (count > 0 || decoded?.junk) {
    await browser.messageDisplayAction.enable(tab.id);
  } else {
    await browser.messageDisplayAction.disable(tab.id);
  }
  await browser.messageDisplayAction.setBadgeText({
    tabId: tab.id,
    text: count > 0 ? String(count) : "",
  });
}

async function handleMessagesDisplayed(tab, messageList) {
  let messages = messageList.messages;

  // Only a single displayed message has a message body we can work with.
  if (messages.length != 1) {
    await updateAction(tab, null);
    return;
  }

  let decoded;
  try {
    decoded = await getDecodedMessage(messages[0].id);
  } catch (error) {
    console.error("LookOut: unable to decode TNEF attachments", error);
    await updateAction(tab, null);
    return;
  }

  await updateAction(tab, decoded);

  if (decoded.junk) {
    await sendToMessageDisplay(tab, {
      command: "showJunkTnefWarning",
      message: browser.i18n.getMessage("junk_tnef_warning"),
    });
    return;
  }

  /*
   * Replace the displayed message body if TNEF contained
   * body_part_0.html.
   */
  if (decoded.body !== null) {
    await sendToMessageDisplay(tab, {
      command: "replaceMessageBody",
      html: decoded.body,
    });
  }
}

// Handle messages which were already displayed when LookOut was started.
async function handleAlreadyDisplayedMessages() {
  let tabs = (await browser.tabs.query({}))
    .filter(t => ["messageDisplay", "mail"].includes(t.type));
  for (let tab of tabs) {
    try {
      let messageList = await browser.messageDisplay.getDisplayedMessages(tab.id);
      // Do not await this but just fire all requests in parallel
      // and let them finish on their own.
      handleMessagesDisplayed(tab, messageList);
    } catch (error) {
      console.error("LookOut: unable to check displayed messages", error);
    }
  }
}

/*
 * Requests from the popup.
 */

async function getPopupData(tabId) {
  let { messages } = await browser.messageDisplay.getDisplayedMessages(tabId);
  if (messages.length != 1) {
    return { state: "none", files: [] };
  }

  let message = messages[0];
  let decoded = await getDecodedMessage(message.id);
  if (decoded.junk) {
    return { state: "junk", messageId: message.id, files: [] };
  }

  return {
    state: decoded.files.length > 0 ? "ok" : "none",
    messageId: message.id,
    subject: message.subject,
    files: decoded.files.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
  };
}

async function downloadFile(file, saveAs) {
  let url = URL.createObjectURL(file);
  try {
    let downloadId = await browser.downloads.download({
      url,
      filename: sanitizeFilename(file.name),
      saveAs,
      conflictAction: "uniquify",
    });
    downloadUrls.set(downloadId, url);
    return downloadId;
  } catch (error) {
    // Also thrown if the user cancelled the file picker.
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function downloadFiles(messageId, indices, saveAs) {
  let decoded = await getDecodedMessage(messageId);
  let files = indices.map(index => decoded.files[index]);
  if (files.some(file => !file)) {
    throw new Error("LookOut: unknown decoded file");
  }

  for (let file of files) {
    await downloadFile(file, saveAs);
  }
}

function handleDownloadChanged(delta) {
  let url = downloadUrls.get(delta.id);
  if (!url || !delta.state) {
    return;
  }
  if (["complete", "interrupted"].includes(delta.state.current)) {
    URL.revokeObjectURL(url);
    downloadUrls.delete(delta.id);
  }
}

function handleRuntimeMessage(request, sender) {
  // Only accept requests from our own extension pages (not content scripts).
  if (
    sender.id != browser.runtime.id ||
    !sender.url?.startsWith(browser.runtime.getURL(""))
  ) {
    return;
  }

  switch (request?.command) {
    case "getDecodedFiles":
      return getPopupData(request.tabId);
    case "downloadFiles":
      return downloadFiles(request.messageId, request.indices, !!request.saveAs);
  }
  return;
}
