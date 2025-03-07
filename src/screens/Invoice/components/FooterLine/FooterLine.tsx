import { cloneElement, useCallback, useState } from "react";
import { ComponentStack, Icon, Pressable } from "@components";
import {
  faCheck,
  faCopy,
  faExternalLinkAlt
} from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "styled-components";
import { Clipboard } from "@utils";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import * as S from "./styled";

type FooterLineProps = {
  label: string;
  value: string;
  valueSuffix?: string;
  color?: string;
  url?: string;
  prefixIcon?: { icon: IconProp; color?: string };
  prefixComponent?: React.ReactElement;
  suffixComponent?: React.ReactElement;
  copyable?: boolean | string;
};

const ICON_SIZE = 18;

export const FooterLine = ({
  label,
  value,
  valueSuffix = "",
  color,
  url,
  prefixIcon,
  prefixComponent,
  suffixComponent,
  copyable = false
}: FooterLineProps) => {
  const { colors } = useTheme();
  const [isCopied, setIsCopied] = useState(false);

  const onPress = useCallback(() => {
    if (Clipboard.setString(typeof copyable === "string" ? copyable : value)) {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  }, [copyable, value]);

  return (
    <S.FooterLineContainer>
      <S.FooterLabel>{label}</S.FooterLabel>
      <ComponentStack
        direction="horizontal"
        gapSize={8}
        // @ts-ignore
        as={Pressable}
        disabled={!copyable && !url}
        onPress={url || onPress}
        target="_blank"
        rel="noopener noreferrer"
      >
        {prefixIcon && (
          <Icon
            size={ICON_SIZE}
            icon={prefixIcon.icon}
            color={prefixIcon.color || color}
          />
        )}
        {prefixComponent && cloneElement(prefixComponent, { color })}
        {(copyable || url) && (
          <Icon
            size={ICON_SIZE}
            icon={url ? faExternalLinkAlt : isCopied ? faCheck : faCopy}
            color={color || colors.white}
          />
        )}
        <S.FooterValue color={color || colors.white}>
          {value}
          {valueSuffix}
        </S.FooterValue>
        {suffixComponent && cloneElement(suffixComponent, { color })}
      </ComponentStack>
    </S.FooterLineContainer>
  );
};
