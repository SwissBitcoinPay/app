import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Bitbox } from "@utils";
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
import { SBPModalContext } from "./SBPModalContext";
import { animated, easings, useSpring } from "@react-spring/native";
import { platform } from "@config";
import { BackupMode } from "@components/ConnectWalletModal/components/Setup/Setup";
import { useTheme } from "styled-components";
import { SBPBitboxContextType } from "./SBPBitboxContext";

const { isBitcoinize } = platform;

const AnimatedIcon = animated(Icon);

// [start, end]
const ATTENTION_ARROW_TRANSLATE_Y = isBitcoinize ? [0, 35] : [0, 35];

// @ts-ignore
export const SBPBitboxContext = React.createContext<SBPBitboxContextType>({});

export const SBPBitboxContextProvider = ({ children }: PropsWithChildren) => {
  const [isAfterUpgradeScreen, setIsAfterUpgradeScreen] = useState(false);
  const [afterSetupMode, setAfterSetupMode] = useState<BackupMode>();
  const { setModalOverlayComponent } = useContext(SBPModalContext);
  const currentListeners = useRef<TMsgCallback[]>([]);
  const subscriptions = useRef<Subscriptions>({});
  const legacySubscriptions = useRef<Subscriptions>({});

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

  const setAttentionToBitbox = useCallback(
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
        if (!observers.includes(observer)) {
          console.warn("!observers.includes(observer)");
        }
        const index = observers.indexOf(observer);
        observers.splice(index, 1);
        if (observers.includes(observer)) {
          console.warn("observers.includes(observer)");
        }
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
      if (observers.includes(observer)) {
        console.error(`observer already registered for ${subject}`);
      }
      observers.push(observer);
      return () => {
        if (!observers.includes(observer)) {
          console.error("!observers.includes(observer)");
        }
        const index = observers.indexOf(observer);
        observers.splice(index, 1);
      };
    },
    [handleMessages, isLegacySubscriberSet, pushNotificationListener]
  );

  const ref = useRef<WebView>(null);
  const messages = useRef<{ [k in number]: (value: unknown) => void }>({});
  const bitboxQueryId = useRef<number>(1);
  const isServerStated = useRef<boolean>(false);

  const toast = useToast();

  const onLoad = useCallback(() => {
    if (!isServerStated.current) {
      Bitbox.startBitBoxBridge()
        .then(() => {
          isServerStated.current = true;
        })
        .catch((error) => console.error(error));
    }
  }, []);

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
        toast.show(`Error: ${eventData}`, { type: "error" });
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

  useEffect(() => {
    if (Platform.OS === "web") {
      onLoad();
    }
  }, [onLoad]);

  const _subscribeEndpoint = useCallback(
    (endpoint: string, cb: TSubscriptionCallback<T>) => {
      return apiSubscribe(endpoint, (event: TEvent) => {
        switch (event.action) {
          case "replace":
            cb(event.object);
            break;
          case "reload":
            apiGet(event.subject)
              .then((object) => cb(object))
              .catch(console.error);
            break;
          default:
            throw new Error(`Event: ${event.subject} not supported`);
        }
      });
    },
    [apiSubscribe]
  );

  return (
    <SBPBitboxContext.Provider
      value={{
        pushNotificationListener,
        subscribeEndpoint: _subscribeEndpoint,
        subscribeLegacy,
        onNotification,
        apiSubscribe,
        setAttentionToBitbox,
        setIsAfterUpgradeScreen,
        isAfterUpgradeScreen,
        setAfterSetupMode,
        afterSetupMode
      }}
    >
      {children}
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
        onLoad={onLoad}
        onMessage={onMessage}
      />
    </SBPBitboxContext.Provider>
  );
};
