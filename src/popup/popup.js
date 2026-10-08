/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const status = document.getElementById("status");
const list = document.getElementById("files");
const footer = document.getElementById("footer");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function formatSize(bytes) {
  let units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  let number = value.toLocaleString(undefined, {
    maximumFractionDigits: unit == 0 ? 0 : 1,
  });
  return `${number} ${units[unit]}`;
}

async function download(messageId, indices, saveAs, button) {
  button.disabled = true;
  setStatus("");
  try {
    await browser.runtime.sendMessage({
      command: "downloadFiles",
      messageId,
      indices,
      saveAs,
    });
  } catch (error) {
    console.error("LookOut: download failed", error);
    setStatus(browser.i18n.getMessage("popup_download_error"), true);
  } finally {
    button.disabled = false;
  }
}

function showFiles(data) {
  let template = document.getElementById("file_template");
  let downloadLabel = browser.i18n.getMessage("popup_download");

  data.files.forEach((file, index) => {
    let item = template.content.firstElementChild.cloneNode(true);
    // File names come from the message: only ever use textContent.
    item.querySelector(".name").textContent = file.name;
    item.querySelector(".name").title = file.name;
    item.querySelector(".meta").textContent = `${formatSize(file.size)} · ${file.type}`;

    let button = item.querySelector(".download");
    button.textContent = downloadLabel;
    button.title = `${downloadLabel}: ${file.name}`;
    button.addEventListener("click", () =>
      download(data.messageId, [index], true, button)
    );
    list.append(item);
  });
  list.hidden = false;

  if (data.files.length > 1) {
    let button = document.getElementById("download_all");
    button.addEventListener("click", () =>
      download(data.messageId, data.files.map((file, index) => index), false, button)
    );
    footer.hidden = false;
  }
}

async function init() {
  i18n.updateDocument();
  setStatus(browser.i18n.getMessage("popup_loading"));

  try {
    let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    let data = await browser.runtime.sendMessage({
      command: "getDecodedFiles",
      tabId: tab.id,
    });

    switch (data.state) {
      case "ok":
        setStatus("");
        showFiles(data);
        break;
      case "junk":
        setStatus(browser.i18n.getMessage("junk_tnef_warning"));
        break;
      default:
        setStatus(browser.i18n.getMessage("popup_no_files"));
        break;
    }
  } catch (error) {
    console.error("LookOut: unable to decode TNEF attachments", error);
    setStatus(browser.i18n.getMessage("popup_decode_error"), true);
  }
}

init();
