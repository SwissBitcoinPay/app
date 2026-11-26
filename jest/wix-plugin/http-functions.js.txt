// sattle.me Checkout's HTTP functions (backend/http-functions.js of a Wix site, where Wix looks for
// them): the customer's payment page, the merchant's status page, and their stylesheet
// (backend/sattleme-plugin.js). A site that already has an http-functions.js adds these lines to
// it.

import { payRequest, statusForm, statusRequest, styleRequest } from "./sattleme-plugin.js";

export function get_sattlemeCheckoutPay(request) {
  return payRequest(request);
}

export function get_sattlemeCheckoutStyle() {
  return styleRequest();
}

export function get_sattlemeCheckoutStatus() {
  return statusForm();
}

export function post_sattlemeCheckoutStatus(request) {
  return statusRequest(request);
}
