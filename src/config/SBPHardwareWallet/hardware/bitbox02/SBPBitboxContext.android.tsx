import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Bitbox, sleep } from "@utils";
import {
  TEvent,
  TMsgCallback,
  TPayload,
  TSubject
} from "@utils/Bitbox/api/transport-common";
import { Observer, Subscriptions } from "@utils/Bitbox/api/event";
import { TSubscriptionCallback } from "@utils/Bitbox/api/subscribe";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { apiGet } from "@utils/Bitbox/api/request";
import { useToast } from "react-native-toast-notifications";
import { Icon, Webview } from "@components";
import { faArrowDown } from "@fortawesome/free-solid-svg-icons";
import { animated, easings, useSpring } from "@react-spring/native";
import { platform, SBPModalContext } from "@config";
import { useTheme } from "styled-components";
import { SBPBitboxContextType } from "./SBPBitboxContext";
import {
  BackupMode,
  HardwareState
} from "@config/SBPHardwareWallet/SBPHardwareWalletContext";
import { useTranslation } from "react-i18next";
import { useSync } from "@hooks/bitbox/api";
import {
  getChannelHash,
  getStatus,
  verifyChannelHash
} from "@utils/Bitbox/api/bitbox02";
import {
  screenRotate,
  getStatus as bootloaderGetStatus
} from "@utils/Bitbox/api/bitbox02bootloader";
import { useDefault } from "@hooks/bitbox/default";
import { getDeviceList, TDevices } from "@utils/Bitbox/api/devices";
import { useSignature } from "./hooks";

export const IS_BITBOX_SUPPORTED = true;

const { isBitcoinize } = platform;

const AnimatedIcon = animated(Icon);

// [start, end]
const ATTENTION_ARROW_TRANSLATE_Y = isBitcoinize ? [0, 35] : [0, 35];

// @ts-ignore
export const SBPBitboxContext = React.createContext<SBPBitboxContextType>({});

export const SBPBitboxContextProvider = ({ children }: PropsWithChildren) => {
  // const [state, setState] = useState<HardwareState>();
  const [isBitboxServerRunning, setIsBitboxServerRunning] = useState(false);
  const [isHardwareUpgraded, setIsHardwareUpgraded] = useState(false);
  const [backupMode, setBackupMode] = useState<BackupMode>();
  const [pairingHash, setPairingHash] = useState<string>();
  const { setModalOverlayComponent } = useContext(SBPModalContext);
  const currentListeners = useRef<TMsgCallback[]>([]);
  const subscriptions = useRef<Subscriptions>({});
  const legacySubscriptions = useRef<Subscriptions>({});
  const { t } = useTranslation();
  const toast = useToast();

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const signatureFunctions = useSignature({ error });

  const { colors } = useTheme();

  const [animatedYSpring] = useSpring(() => ({
    from: {
      translateY: ATTENTION_ARROW_TRANSLATE_Y[0]
    },
    to: { translateY: ATTENTION_ARROW_TRANSLATE_Y[1] },
    loop: { reverse: true },
    config: {
      duration: 1000,
      easing: easings.easeInOutQuad
    }
  }));

  const ArrowComponent = useMemo(
    () => (
      <AnimatedIcon
        icon={faArrowDown}
        color={colors.white}
        size={160}
        style={{
          position: "absolute",
          ...(isBitcoinize
            ? {
                left: 35,
                transform: [
                  { translateY: -100 },
                  { rotateZ: "90deg" },
                  { translateY: animatedYSpring.translateY }
                ]
              }
            : {
                bottom: 35,
                transform: [{ translateY: animatedYSpring.translateY }]
              })
        }}
      />
    ),
    [animatedYSpring.translateY, colors.white]
  );

  const setAttentionToHardware = useCallback(
    (value: boolean) => {
      setModalOverlayComponent(value ? ArrowComponent : undefined);
    },
    [ArrowComponent, setModalOverlayComponent]
  );

  const onNotification = useCallback((msg: TPayload) => {
    currentListeners.current.forEach((listener) => listener(msg));
  }, []);

  const pushNotificationListener = useCallback((msgCallback: TMsgCallback) => {
    currentListeners.current.push(msgCallback);
  }, []);

  const handleEvent = useCallback((payload: TPayload): void => {
    if ("subject" in payload && typeof payload.subject === "string") {
      if (subscriptions.current[payload.subject]) {
        for (const observer of subscriptions.current[payload.subject]) {
          observer(payload);
        }
      }
    }
  }, []);

  const [isSubscriberSet, setIsSubscriberSet] = useState(false);

  const apiSubscribe = useCallback(
    (subject: TSubject, observer: Observer) => {
      if (!isSubscriberSet) {
        pushNotificationListener(handleEvent);
        setIsSubscriberSet(true);
      }
      let observers = subscriptions.current[subject];
      if (observers === undefined) {
        observers = [];
        subscriptions.current[subject] = observers;
      }
      observers.push(observer);

      return () => {
        const index = observers.indexOf(observer);
        observers.splice(index, 1);
      };
    },
    [handleEvent, isSubscriberSet, pushNotificationListener]
  );

  const handleMessages = useCallback((payload: TPayload): void => {
    if (
      "type" in payload &&
      payload.data &&
      typeof payload.data === "string" &&
      payload.data in legacySubscriptions.current &&
      legacySubscriptions.current[payload.data].length
    ) {
      for (const observer of legacySubscriptions.current[payload.data]) {
        observer(payload);
      }
    }
  }, []);

  const [isLegacySubscriberSet, setIsLegacySubscriberSet] = useState(false);

  const subscribeLegacy = useCallback(
    (subject: TSubject, observer: Observer) => {
      if (!isLegacySubscriberSet) {
        pushNotificationListener(handleMessages);
        setIsLegacySubscriberSet(true);
      }
      if (!legacySubscriptions.current[subject]) {
        legacySubscriptions.current[subject] = [];
      }
      const observers = legacySubscriptions.current[subject];
      observers.push(observer);
      return () => {
        const index = observers.indexOf(observer);
        observers.splice(index, 1);
      };
    },
    [handleMessages, isLegacySubscriberSet, pushNotificationListener]
  );

  const ref = useRef<WebView>(null);
  const messages = useRef<{ [k in number]: (value: unknown) => void }>({});
  const bitboxQueryId = useRef<number>(1);

  const init = useCallback(async () => {
    setIsBitboxServerRunning(true);
    await sleep(1);
    await Bitbox.startBitBoxBridge();
    await sleep(1);
  }, []);

  const close = useCallback(async () => {
    setIsBitboxServerRunning(false);
    if (isBitboxServerRunning) {
      await Bitbox.stopBitBoxBridge();
    }
    await sleep(1);
  }, [isBitboxServerRunning]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const eventData = event.nativeEvent.data;
      try {
        if (typeof eventData === "string") {
          const {
            queryID: messageQueryId,
            data
          }: { queryID?: number; data: unknown } = JSON.parse(eventData);

          if (messageQueryId !== undefined) {
            if (messages.current[messageQueryId]) {
              messages.current[messageQueryId](data);
              delete messages.current[messageQueryId];
            }
          } else {
            onNotification(data);
          }
        }
      } catch (e) {
        toast.show(`Bitbox error: ${eventData}`, { type: "error" });
      }
    },
    [onNotification, toast]
  );

  const bitboxAndroidSend = useCallback((query: string) => {
    const queryId = bitboxQueryId.current;
    const script = `window.sbp_bitbox_android.call(${queryId}, '${query.replaceAll(
      '\\"',
      '\\\\"'
    )}');`;

    bitboxQueryId.current = queryId + 1;
    ref.current?.injectJavaScript(script);

    return new Promise((resolve) => {
      messages.current[queryId] = resolve;
    });
  }, []);

  useEffect(() => {
    global.bitboxAndroidSend = bitboxAndroidSend;
  }, [bitboxAndroidSend]);

  const subscribeEndpoint = useCallback(
    (endpoint: string, cb: TSubscriptionCallback<T>) => {
      return apiSubscribe(endpoint, (event: TEvent) => {
        switch (event.action) {
          case "replace":
            cb(event.object);
            break;
          case "reload":
            apiGet(event.subject).then((object) => cb(object));
            break;
          default:
            throw new Error(`Event: ${event.subject} not supported`);
        }
      });
    },
    [apiSubscribe]
  );

  const syncDeviceList = useCallback<
    (cb: (accounts: TDevices) => void) => TDevices
  >((cb) => subscribeEndpoint("devices/registered", cb), [subscribeEndpoint]);

  const devices = useDefault(useSync(getDeviceList, syncDeviceList), {});

  const [[deviceId, deviceMode] = []]: [string, TProductName][] = useMemo(
    () =>
      Object.keys(devices).map((key) => [key, devices[key]]) || [
        ["androidDevice", "bitbox02-bootloader"]
      ],
    [devices]
  );

  const syncStatus = useCallback(
    (cb: (accounts: TDevices) => void) => {
      const unsubscribe = subscribeLegacy("statusChanged", (event) => {
        if (event.type === "device" && event.deviceID === deviceId) {
          getStatus(deviceId).then(cb);
        }
      });
      return unsubscribe;
    },
    [deviceId, subscribeLegacy]
  );

  const status = useSync(
    useCallback(() => getStatus(deviceId), [deviceId]),
    syncStatus,
    deviceMode !== "bitbox02"
  );

  const bootloaderSyncStatus = useCallback(
    (cb: (accounts: TDevices) => void) =>
      subscribeEndpoint(`devices/bitbox02-bootloader/${deviceId}/status`, cb),
    [deviceId, subscribeEndpoint]
  );

  const bootloaderStatus = useSync(
    useCallback(() => bootloaderGetStatus(deviceId), [deviceId]),
    bootloaderSyncStatus,
    deviceMode !== "bitbox02-bootloader"
  );

  const state = useMemo(() => {
    if (deviceMode === "bitbox02-bootloader") {
      return HardwareState.Bootloader;
    } else if (deviceMode === "bitbox02") {
      switch (status) {
        case "connected":
          return HardwareState.Connected;
        case "unpaired":
        case "pairingFailed":
          return HardwareState.Pairing;
        case "uninitialized":
        case "seeded":
          return HardwareState.Setup;
        case "initialized":
          return HardwareState.Signature;
      }
    }
    return HardwareState.Connect;
  }, [deviceMode, status]);

  useEffect(() => {
    if (isBitcoinize && deviceMode === "bitbox02-bootloader") {
      (async () => {
        await screenRotate(deviceId);
      })();
    }
  }, [deviceMode]);

  // Pairing
  const onChannelHashChanged = useCallback(() => {
    (async () => {
      const channelHash = await getChannelHash(deviceId);
      if (channelHash.hash && !channelHash.deviceVerified) {
        setPairingHash(channelHash.hash);
        setAttentionToHardware?.(true);
      }
      if (channelHash.deviceVerified) {
        await verifyChannelHash(deviceId, true);
      }
    })();
  }, [deviceId, setAttentionToHardware]);

  useEffect(() => {
    return () => {
      setAttentionToHardware?.(false);
    };
  }, []);

  useEffect(onChannelHashChanged, [deviceId, onChannelHashChanged]);

  const channelHashChanged = (
    deviceID: string,
    cb: (deviceID: string) => void
  ): TUnsubscribe => {
    const unsubscribe = subscribeLegacy("channelHashChanged", (event) => {
      if (event.type === "device" && event.deviceID === deviceID) {
        cb(deviceID);
      }
    });
    return unsubscribe;
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return channelHashChanged(deviceId, onChannelHashChanged);
  }, [onChannelHashChanged, deviceId]);

  const screenComponentProps = useMemo(() => {
    let obj = {};
    if (backupMode && backupMode !== "sdcard") {
      obj = {
        ...obj,
        buttonProps: {
          title: t("connectWalletModal.iUnderstand"),
          onPress: () => {
            setBackupMode(undefined);
          }
        }
      };
    }

    if (deviceMode === "bitbox02") {
      obj = {
        ...obj,
        componentProps: {
          deviceId,
          status
        }
      };
    } else if (deviceMode === "bitbox02-bootloader") {
      obj = {
        ...obj,
        componentProps: {
          deviceId,
          status: bootloaderStatus
        }
      };
    }

    return obj;
  }, [backupMode, deviceId, bootloaderStatus, deviceMode, status, t]);

  return (
    <SBPBitboxContext.Provider
      value={{
        state,
        // setState,
        init,
        close,
        // subscribeEndpoint: _subscribeEndpoint,
        // subscribeLegacy,
        setAttentionToHardware,
        setIsHardwareUpgraded,
        isHardwareUpgraded,
        screenComponentProps,
        setBackupMode,
        pairingHash,
        setPairingHash,
        ...signatureFunctions
        // backupMode
      }}
    >
      {children}
      {isBitboxServerRunning && (
        <Webview
          ref={ref}
          androidWebviewId="sbp_bitbox_webview"
          source={{ html: "" }}
          containerStyle={{
            position: "static",
            maxHeight: 0,
            maxWidth: 0,
            height: 0,
            width: 0,
            flex: 0
          }}
          onMessage={onMessage}
        />
      )}
    </SBPBitboxContext.Provider>
  );
};
