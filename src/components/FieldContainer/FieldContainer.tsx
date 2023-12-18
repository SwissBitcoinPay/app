import { ComponentProps, PropsWithChildren, useState } from "react";
import { useTheme } from "styled-components";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Button, ComponentStack, Icon, Text } from "@components";
import { faAdd, faMinus } from "@fortawesome/free-solid-svg-icons";
import * as S from "./styled";

type FieldContainerProps = PropsWithChildren<{
  title: string;
  icon?: IconProp;
  buttonProps?: ComponentProps<typeof Button>;
  isOptionnal?: boolean;
  isDefaultOpen?: boolean;
}>;

export const FieldContainer = ({
  title,
  icon,
  buttonProps,
  isOptionnal = false,
  isDefaultOpen = !isOptionnal,
  children
}: FieldContainerProps) => {
  const theme = useTheme();

  const [isOpen, setIsOpen] = useState(isDefaultOpen);

  return (
    <>
      <S.FieldTitleContainer
        direction="horizontal"
        gapSize={10}
        isOpen={isOpen}
      >
        {icon && <Icon color={theme.colors.white} icon={icon} size={22} />}
        <Text h4 weight={600} color={theme.colors.white}>
          {title}
        </Text>
        {(buttonProps || isOptionnal) && (
          <S.TitleRightContainer>
            {buttonProps && (
              <Button size="small" type="bitcoin" {...buttonProps} />
            )}
            {isOptionnal && (
              <Button
                size="small"
                icon={!isOpen ? faAdd : faMinus}
                onPress={() => {
                  setIsOpen(!isOpen);
                }}
              />
            )}
          </S.TitleRightContainer>
        )}
      </S.FieldTitleContainer>
      {isOpen && <ComponentStack gapSize={10}>{children}</ComponentStack>}
    </>
  );
};
