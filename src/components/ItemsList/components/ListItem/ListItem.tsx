import { useMemo } from "react";
import {
  IconDefinition,
  faArrowRight,
  faPen
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { StyledComponentComponentProps } from "@types";
import { XOR } from "ts-essentials";
import { ComponentStack } from "@components";
import * as S from "./styled";

type Tag = { value?: string | React.ReactNode; color?: string };

type ListItemProps = {
  title: string;
  titleColor?: string;
  tags: Tag[];
} & XOR<
  { icon?: IconDefinition; iconColor?: string },
  { component: React.ReactNode }
> &
  StyledComponentComponentProps<typeof S.ListItemContainer>;

export const ListItem = ({
  title,
  titleColor,
  icon,
  iconColor,
  component,
  tags,
  ...props
}: ListItemProps) => {
  const { t } = useTranslation();

  const isNotSet = useMemo(() => tags.length === 0, [tags]);

  return (
    <S.ListItemContainer {...props}>
      {icon ? (
        <S.ValueIcon icon={icon} size={26} color={iconColor} />
      ) : (
        component
      )}
      <S.LeftContainer isNotSet={isNotSet}>
        <S.ListItemTitle h4 weight={600} color={titleColor} isNotSet={isNotSet}>
          {title}
        </S.ListItemTitle>
        <S.ValuesComponentScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <ComponentStack direction="horizontal" gapSize={8}>
            {tags.map(({ value, color }, index) => {
              const isDisabled = value === false;
              const isUndefined = value === undefined;

              return (
                <S.ListItemValue
                  key={index}
                  isNotSet={isUndefined}
                  isDisabled={isDisabled}
                  customColor={color}
                >
                  {(() => {
                    switch (typeof value) {
                      case "string":
                      case "undefined":
                      case "boolean":
                        return (
                          <ListItemValueText
                            isNotSet={isUndefined}
                            isDisabled={isDisabled}
                          >
                            {typeof value !== "boolean"
                              ? value || t("common.notSet")
                              : `${t(
                                  `common.${value ? "enabled" : "disabled"}`
                                )}${value ? " ✅" : ""}`}
                          </ListItemValueText>
                        );
                      case "object":
                        return value;
                    }
                  })()}
                </S.ListItemValue>
              );
            })}
          </ComponentStack>
        </S.ValuesComponentScrollView>
      </S.LeftContainer>
      {!props.disabled && (
        <S.EditIcon
          icon={typeof props.onPress === "function" ? faPen : faArrowRight}
          size={26}
        />
      )}
    </S.ListItemContainer>
  );
};

export const ListItemValueText = S.ListItemText;
