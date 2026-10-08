const PREF_DEFAULTS = {
  "attach_raw_mapi": false,
  "disable_filename_character_set": false,
  "replace_body": true,
  "strict_contenttype": true,
  "debug_enabled": false,
  "body_part_prefix": "body_part_",
}

export async function getPrefs() {
  // One option to access stored values is
  //    let { option } = await browser.storage.local.get({ option: defaultValue })
  // We can therefore simply pass in our PREF_DEFAULTS object and get back the
  // desired prefs object, with the current values for each stored pref, or the
  // associated default value.
  return browser.storage.local.get(PREF_DEFAULTS)
}