import { FontAwesomeIconProps } from "@fortawesome/react-fontawesome";
import { StyledComponentComponentProps } from "@types";
import { useIsScreenSizeMin, useSafeAreaInsets } from "@hooks";
import { Blur, Icon } from "@components";
import { hexToRgb } from "@utils";
import { useTheme } from "styled-components";
import * as S from "./styled";

const HEADER_ICON_SIZE = 30;

type IconType = {
  onPress?: StyledComponentComponentProps<
    typeof S.SubTitleContainer
  >["onPress"];
  icon: FontAwesomeIconProps["icon"];
};

type HeaderProps = {
  title: string;
  subTitle?: {
    icon: FontAwesomeIconProps["icon"];
    color?: string;
    text: string;
    isSecondary?: boolean;
    onPress?: StyledComponentComponentProps<
      typeof S.SubTitleContainer
    >["onPress"];
  };
  left?: IconType;
  right?: IconType;
  backgroundOpacity?: number;
} & StyledComponentComponentProps<typeof S.Header>;

export const Header = ({
  title,
  subTitle,
  left,
  right,
  backgroundOpacity = 0.25,
  ...props
}: HeaderProps) => {
  const isLarge = useIsScreenSizeMin("large");
  const { top } = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <S.Header {...props} topInset={top} isLargeScreen={isLarge}>
      <Blur
        backgroundColor={`rgba(${
          hexToRgb(theme.colors.primary).formatted
        }, ${backgroundOpacity})`}
        blurRadius={6}
        zIndex={-1}
      />
      <S.HeaderButton onPress={left?.onPress} disabled={!left?.onPress}>
        {left && <S.HeaderIcon icon={left.icon} size={HEADER_ICON_SIZE} />}
      </S.HeaderButton>
      <S.HeaderTitleContainer>
        <S.HeaderTitle weight={700}>{title}</S.HeaderTitle>
        {subTitle && (
          <S.SubTitleContainer
            onPress={subTitle.onPress}
            disabled={!subTitle.onPress}
          >
            <Icon
              icon={subTitle.icon}
              color={subTitle.color || theme.colors.greyLight}
              size={12}
            />
            <S.SubTitleText
              h5
              weight={600}
              color={subTitle.color || theme.colors.greyLight}
            >
              {subTitle.text}
            </S.SubTitleText>
          </S.SubTitleContainer>
        )}
      </S.HeaderTitleContainer>
      <S.HeaderButton onPress={right?.onPress} disabled={!right?.onPress}>
        {right && <S.HeaderIcon icon={right.icon} size={HEADER_ICON_SIZE} />}
      </S.HeaderButton>
    </S.Header>
  );
};
