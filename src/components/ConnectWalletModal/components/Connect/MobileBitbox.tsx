import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, Image, View } from "@components";
import { animated, easings, useSpring } from "@react-spring/native";
import { platform } from "@config";
import * as ConnectStyled from "../../styled";
import { hardwareNames } from "@utils";

const { isBitcoinize } = platform;

// [start, end]
const TRANSLATE_X = isBitcoinize ? [-120, -88] : [-60, -15];

const AnimatedImage = animated(Image);

export const MobileBitbox = () => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.connect"
  });

  const [animatedXSpring, animatedXSpringApi] = useSpring(() => ({
    from: {
      translateX: TRANSLATE_X[0]
    }
  }));

  useEffect(() => {
    const startConnectAnimation = () => {
      animatedXSpringApi.start({
        immediate: true,
        to: {
          translateX: TRANSLATE_X[0]
        }
      });
      animatedXSpringApi.start({
        config: {
          duration: 1500,
          easing: easings.easeInOutQuart
        },
        to: {
          translateX: TRANSLATE_X[1]
        }
      });
    };

    startConnectAnimation();
    const interval = setInterval(startConnectAnimation, 3000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const BitboxImage = useMemo(
    () => (
      <AnimatedImage
        source={require("@assets/images/bitbox02.png")}
        style={{
          position: isBitcoinize ? "absolute" : "relative",
          aspectRatio: "395/186",
          width: 100,
          marginBottom: !isBitcoinize ? 80 : 0,
          transform: [
            ...(!isBitcoinize ? [{ rotate: "270deg" }] : [{ translateY: 15 }]),
            { translateX: animatedXSpring.translateX }
          ]
        }}
      />
    ),
    [animatedXSpring.translateX]
  );

  return (
    <ComponentStack gapSize={10}>
      <ConnectStyled.Title>
        {t("title", { hardwareWallet: hardwareNames["bitbox02"] })}
      </ConnectStyled.Title>
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: isBitcoinize ? "row" : "column"
        }}
      >
        {isBitcoinize && BitboxImage}
        {isBitcoinize ? (
          <Image
            source={require("@assets/images/bitcoinize.png")}
            style={{
              aspectRatio: "256/673",
              width: 100,
              zIndex: 1
            }}
          />
        ) : (
          <Image
            source={require("@assets/images/phone.png")}
            style={{
              aspectRatio: "75/128",
              width: 100,
              zIndex: 1
            }}
          />
        )}
        {!isBitcoinize && BitboxImage}
      </View>
    </ComponentStack>
  );
};
