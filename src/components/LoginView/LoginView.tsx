import { ComponentProps, PropsWithChildren } from "react";
import { useTheme } from "styled-components";
import { Button, ComponentStack, Text } from "@components";
import * as S from "./styled";

type LoginViewProps = PropsWithChildren<{
  title: string;
  button: ComponentProps<typeof Button>;
}>;

export const LoginView = ({ title, button, children }: LoginViewProps) => {
  const { colors } = useTheme();

  return (
    <S.LoginViewComponentStack>
      <S.ContentContainer>
        <Text h3 weight={600} color={colors.primary}>
          {title}
        </Text>
        <ComponentStack gapSize={12}>{children}</ComponentStack>
      </S.ContentContainer>
      <S.LoginViewButton type="bitcoin" {...button} />
    </S.LoginViewComponentStack>
  );
};
