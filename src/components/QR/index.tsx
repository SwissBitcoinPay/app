import { ImageURISource } from "react-native";
import QRCode, { QRCodeProps } from "react-qr-code";
import { useTheme } from "styled-components";
import * as S from "./styled";

type QRProps = Omit<QRCodeProps, "ref"> & {
  image?: {
    source: ImageURISource;
    scale?: number;
    hidePieces?: boolean;
  };
};

const extractPaddingFromStyle = <T extends React.CSSProperties>(
  style: T
): {
  padding: number;
  borderRadius: number;
  restStyle: React.CSSProperties;
} => {
  const {
    paddingTop,
    paddingRight,
    paddingLeft,
    paddingBottom,
    borderTopLeftRadius,
    borderTopRightRadius,
    borderBottomLeftRadius,
    borderBottomRightRadius,
    ...restStyle
  } = style || {};

  let padding = 0;
  if (
    typeof paddingTop === "number" &&
    paddingTop === paddingRight &&
    paddingTop === paddingLeft &&
    paddingTop === paddingBottom
  ) {
    padding = paddingTop;
  }

  let borderRadius = 0;
  if (
    typeof borderTopLeftRadius === "number" &&
    borderTopLeftRadius === borderTopRightRadius &&
    borderTopLeftRadius === borderBottomLeftRadius &&
    borderTopLeftRadius === borderBottomRightRadius
  ) {
    borderRadius = borderTopLeftRadius;
  }
  return { padding, borderRadius, restStyle };
};

export const QR = ({ style, image, size, ...props }: QRProps) => {
  const theme = useTheme();
  const { padding, borderRadius, restStyle } = extractPaddingFromStyle(
    style as React.CSSProperties
  );

  return (
    <S.QRContainer
      style={{ padding, borderRadius, width: (size || 0) + padding * 2 }}
    >
      <QRCode
        fgColor={theme.colors.primary}
        style={restStyle}
        size={size}
        {...props}
      />
      {image && (
        <S.QRImage
          source={image.source}
          style={{ transform: [{ scale: image.scale || 1 }] }}
        />
      )}
    </S.QRContainer>
  );
};
