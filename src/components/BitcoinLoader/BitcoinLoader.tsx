import { Lottie } from "@components";

export const BitcoinLoader = () => (
  <Lottie
    style={{
      height: 160,
      width: 160
    }}
    hardwareAccelerationAndroid
    source={require("@assets/animations/bitcoin.json")}
    loop
    autoPlay
  />
);
