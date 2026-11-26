// sattle.me Checkout's backend events (backend/events.js of a Wix site, where Wix looks for them): a
// contact that Wix deleted, or merged into another (backend/sattleme-plugin.js). A site that
// already has an events.js adds these lines to it.

import { contactDeleted, contactsMerged } from "./sattleme-plugin.js";

export function wixCrm_onContactDeleted(event) {
  return contactDeleted(event);
}

export function wixCrm_onContactMerged(event) {
  return contactsMerged(event);
}
