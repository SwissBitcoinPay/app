import { useTheme } from "styled-components";
import { PropsWithChildren } from "react";
import { Icon } from "@components";
import * as S from "./styled";
import { faWarning } from "@fortawesome/free-solid-svg-icons";

type CalloutProps = PropsWithChildren;

export const Callout = ({ children, ...props }: CalloutProps) => {
  const { colors } = useTheme();

  return (
    <S.CalloutContainer direction="horizontal" gapSize={12} {...props}>
      <Icon icon={faWarning} color={colors.white} size={20} />
      <S.CalloutText h5 weight={600}>
        {children}
      </S.CalloutText>
    </S.CalloutContainer>
  );
};
