import { useTheme } from "styled-components";
import { ComponentStack, Text } from "@components";
import * as S from "./styled";

type WordProps = {
  word: string;
  index: number;
};

export const Word = ({ word, index }: WordProps) => {
  const { colors } = useTheme();

  return (
    <ComponentStack direction="horizontal" gapSize={10}>
      <S.IndexContainer>
        <S.IndexText>{index}</S.IndexText>
      </S.IndexContainer>
      <Text h4 color={colors.white} weight={600}>
        {word}
      </Text>
    </ComponentStack>
  );
};
