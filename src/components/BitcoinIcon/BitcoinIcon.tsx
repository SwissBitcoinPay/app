import { Props as FontAwesomeProps } from "@fortawesome/react-native-fontawesome";
import { faBitcoin } from "@fortawesome/free-brands-svg-icons";
import { useTheme } from "styled-components";
import * as S from "./styled";

export const BitcoinIcon = ({
  style,
  size = 30,
  iconBackgroundColor,
  ...props
}: Omit<FontAwesomeProps, "icon"> & { iconBackgroundColor?: string }) => {
  const theme = useTheme();

  return (
    <S.BitcoinIconContainer style={style} size={size}>
      <S.BitcoinIcon
        color={theme.colors.bitcoin}
        {...props}
        icon={faBitcoin}
        size={size}
      />
      <S.BitcoinIconBackground backgroundColor={iconBackgroundColor} />
    </S.BitcoinIconContainer>
  );
};
