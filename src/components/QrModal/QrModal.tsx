import { ComponentProps, useMemo } from "react";
import { Modal, QR } from "@components";
import { useIsScreenSizeMin } from "@hooks";
import { useWindowDimensions } from "react-native";
import * as S from "./styled";

type QrModalProps = Omit<ComponentProps<typeof Modal>, "children"> & {
  qrProps: Omit<ComponentProps<typeof QR>, "size">;
};

export const QrModal = ({ qrProps, ...props }: QrModalProps) => {
  const isLarge = useIsScreenSizeMin("large");
  const { width } = useWindowDimensions();

  const size = useMemo(() => (isLarge ? width * 0.21 : 300), [width, isLarge]);

  return (
    <Modal {...props}>
      <S.QRContent {...qrProps} size={size} />
    </Modal>
  );
};
