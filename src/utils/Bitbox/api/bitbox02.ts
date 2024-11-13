/**
 * Copyright 2023-2024 Shift Crypto AG
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { apiGet, apiPost } from "./request";
import { SuccessResponse, FailResponse } from "./response";

// BitBox02 error codes.
export const errUserAbort = 104;

export type DeviceInfo = {
  initialized: boolean;
  mnemonicPassphraseEnabled: boolean;
  name: string;
  securechipModel: string;
  version: string;
};

type DeviceInfoResponse = SuccessResponse & {
  deviceInfo: DeviceInfo;
};

export const getDeviceInfo = (
  deviceID: string
): Promise<DeviceInfoResponse | FailResponse> => {
  return apiGet(`devices/bitbox02/${deviceID}/info`);
};

export const checkSDCard = (deviceID: string): Promise<boolean> => {
  return apiGet(`devices/bitbox02/${deviceID}/check-sdcard`);
};

export const insertSDCard = (
  deviceID: string
): Promise<SuccessResponse | FailResponse> => {
  return apiPost(`devices/bitbox02/${deviceID}/insert-sdcard`);
};

export const setDeviceName = (
  deviceID: string,
  newDeviceName: string
): Promise<SuccessResponse | FailResponse> => {
  return apiPost(`devices/bitbox02/${deviceID}/set-device-name`, {
    name: newDeviceName
  });
};

export const createBackup = (
  deviceID: string,
  method: "sdcard" | "recovery-words"
): Promise<FailResponse | SuccessResponse> => {
  return apiPost(`devices/bitbox02/${deviceID}/backups/create`, method);
};

export const upgradeDeviceFirmware = (deviceID: string): Promise<void> => {
  return apiPost(`devices/bitbox02/${deviceID}/upgrade-firmware`);
};

export type TStatus =
  | "connected"
  | "initialized"
  | "pairingFailed"
  | "require_firmware_upgrade"
  | "require_app_upgrade"
  | "seeded"
  | "unpaired"
  | "uninitialized";

export const getStatus = (deviceID: string): Promise<TStatus> => {
  return apiGet(`devices/bitbox02/${deviceID}/status`);
};

type TChannelHash = {
  hash: string;
  deviceVerified: boolean;
};

export const getChannelHash = (deviceID: string): Promise<TChannelHash> => {
  return apiGet(`devices/bitbox02/${deviceID}/channel-hash`);
};

export const verifyChannelHash = (
  deviceID: string,
  ok: boolean
): Promise<void> => {
  return apiPost(`devices/bitbox02/${deviceID}/channel-hash-verify`, ok);
};

export const setPassword = (
  deviceID: string,
  seedLen: 16 | 32
): Promise<SuccessResponse | FailResponse> => {
  return apiPost(`devices/bitbox02/${deviceID}/set-password`, seedLen);
};
