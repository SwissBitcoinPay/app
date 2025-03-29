/**
 * Copyright 2018 Shift Devices AG
 * Copyright 2022-2024 Shift Crypto AG
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

export const call: (query: string) => Promise<unknown> = window?.bitboxAndroidSend;

export const apiGet = (endpoint: string) => {
  return call(
    JSON.stringify({
      method: "GET",
      endpoint
    })
  );
};

export const apiPost = (
  endpoint: string,
  body?: object | number | string | boolean // any is not safe to use, for example Set and Map are stringified to empty "{}"
) => {
  return call(
    JSON.stringify({
      method: "POST",
      endpoint,
      body: JSON.stringify(body)
    })
  );
};
