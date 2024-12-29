import * as S from "./styled";
import { useIsScreenSizeMin } from "@hooks";
import { useLocation } from "@components/Router";
import { useContext } from "react";
import { SBPContext } from "@config";

export const TopLeftLogo = () => {
  const isExtraLarge = useIsScreenSizeMin("extraLarge");
  const { userType } = useContext(SBPContext);
  const { pathname } = useLocation();

  return (
    isExtraLarge &&
    (userType || pathname !== "/") && (
      <S.PressableLogo onPress="/">
        <S.TopLeftLogo source={require("@assets/images/logo-white.png")} />
      </S.PressableLogo>
    )
  );
};
