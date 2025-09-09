/**
 * Copyright 2018 Shift Devices AG
 * Copyright 2022 Shift Crypto AG
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

// Mock type for missing websocket import
type TUnsubscribe = () => void;
import { TEvent } from "./transport-common";

export type { TEvent, TUnsubscribe };

/**
 * This type describes the function used to observe the events.
 */
export type Observer = (event: TEvent) => void;

/**
 * This interface describes how the subscriptions are stored.
 */
export interface Subscriptions {
  [subject: string]: Observer[]; // TypeScript does not allow the type alias Subject there.
}
