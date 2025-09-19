import { PropsWithChildren, useEffect, useState } from "react";
import { useTheme } from "styled-components";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Button, ComponentStack, Icon, Text } from "@components";
import { faAdd, faMinus } from "@fortawesome/free-solid-svg-icons";
import * as S from "./styled";
import { useIsScreenSizeMin } from "@hooks";
import { FIELD_BORDER_WIDTH } from "@components/BaseField/styled";
import { useTranslation } from "react-i18next";

type FieldContainerProps = PropsWithChildren<{
  title: string;
  icon?: IconProp;
  isOptionnal?: boolean;
  isDefaultOpen?: boolean;
  multiline?: boolean;
}>;

export const FieldContainer = ({
  title,
  icon,
  isOptionnal = false,
  isDefaultOpen = !isOptionnal,
  children,
  multiline = false
}: FieldContainerProps) => {
  const theme = useTheme();
  const { t } = useTranslation();

  const isLarge = useIsScreenSizeMin("large");

  const [isOpen, setIsOpen] = useState(isDefaultOpen);

  useEffect(() => {
    setIsOpen(isDefaultOpen);
  }, [isDefaultOpen]);

  return (
    <S.StyledFieldContainer
      {...(isLarge
        ? {
            direction: "horizontal",
            style: {
              width: "100%",
              ...(multiline ? { alignItems: "flex-start" } : {})
            }
          }
        : {
            direction: "vertical",
            gapSize: 0,
            style: {
              borderWidth: 0
            }
          })}
    >
      <S.FieldTitleContainer
        isOpen={isOpen}
        {...(isLarge
          ? {
              direction: "horizontal",
              gapSize: 0,
              style: {
                flex: 2
              }
            }
          : {
              direction: "vertical",
              gapSize: 10,
              style: {
                marginVertical: 10
              }
            })}
      >
        <ComponentStack
          direction="horizontal"
          style={{
            width: "100%",
            justifyContent: "space-between",
            ...(multiline
              ? {
                  paddingTop: 11,
                  alignItems: "flex-start"
                }
              : {})
          }}
        >
          <ComponentStack
            direction="horizontal"
            gapSize={10}
            style={{
              flex: 1,
              ...(multiline
                ? {
                    alignItems: "flex-start"
                  }
                : {})
            }}
          >
            {icon && <Icon color={theme.colors.white} icon={icon} size={22} />}
            <ComponentStack direction="vertical" gapSize={0}>
              <Text h4 weight={600} color={theme.colors.white}>
                {title}
              </Text>
              {isOptionnal && (
                <Text h6 weight={500} color={theme.colors.greyLight}>
                  {t("common.optional")}
                </Text>
              )}
            </ComponentStack>
          </ComponentStack>
          {isOptionnal && (!isLarge || !isOpen) && (
            <Button
              size="small"
              title={t(isOpen ? "common.close" : "common.enter")}
              icon={!isOpen ? faAdd : faMinus}
              onPress={() => {
                setIsOpen(!isOpen);
              }}
            />
          )}
        </ComponentStack>
      </S.FieldTitleContainer>
      {isOpen && (
        <ComponentStack
          style={{
            marginTop: -FIELD_BORDER_WIDTH,
            ...(isLarge
              ? {
                  flex: 3,
                  marginRight: -FIELD_BORDER_WIDTH,
                  marginBottom: -FIELD_BORDER_WIDTH
                }
              : {})
          }}
          gapSize={10}
        >
          {children}
        </ComponentStack>
      )}
    </S.StyledFieldContainer>
  );
};
