import { FlexStyle, ViewStyle } from "react-native";
import {
  LogoOptions,
  SVGQRCodeStyledProps,
  useQRCodeData
} from "react-native-qrcode-styled";
import { useTheme } from "styled-components";
import * as S from "./styled";

type QRProps = Omit<SVGQRCodeStyledProps, "padding" | "logo"> & {
  size: number;
  image?: {
    source: LogoOptions["href"];
    scale?: number;
    hidePieces?: boolean;
  };
};

const extractPaddingFromStyle = <T extends FlexStyle>(
  style: T
): { padding: number; restStyle: FlexStyle } => {
  const { paddingTop, paddingRight, paddingLeft, paddingBottom, ...restStyle } =
    style || {};

  let padding = 0;
  if (
    typeof paddingTop === "number" &&
    paddingTop === paddingRight &&
    paddingTop === paddingLeft &&
    paddingTop === paddingBottom
  ) {
    padding = paddingTop;
  }
  return { padding, restStyle };
};

export const QR = ({ size, style, image, ...props }: QRProps) => {
  const theme = useTheme();
  const data = useQRCodeData(props.data || "", props);
  const { padding, restStyle } = extractPaddingFromStyle(style as ViewStyle);

  return (
    <S.QRContainer
      pieceSize={size / data.qrCodeSize}
      pieceScale={1.05}
      color={theme.colors.primary}
      padding={padding}
      style={restStyle}
      {...props}
      {...(image
        ? {
            logo: {
              href: image.source,
              scale: image.scale,
              hidePieces: image.hidePieces || false
            }
          }
        : {})}
    />
  );
};
