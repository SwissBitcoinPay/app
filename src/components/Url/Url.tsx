import { useTheme } from "styled-components";
import { Text } from "@components";
import * as S from "./styled";

type UrlProps = {
  title: string;
  href: `https://${string}`;
  as: React.ElementType<{ color?: string }>;
};

export const Url = ({ title, href, as: As = Text, ...props }: UrlProps) => {
  const theme = useTheme();

  return (
    <S.Pressable onPress={href} {...props}>
      <As as={S.Text} color={theme.colors.link}>
        {title}
      </As>
    </S.Pressable>
  );
};
