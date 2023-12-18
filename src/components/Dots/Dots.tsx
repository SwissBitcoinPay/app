import { Dot } from "@components";
import * as S from "./styled";

type DotsProps = {
  step: number;
  total: number;
};

export const Dots = ({ step, total }: DotsProps) => (
  <S.DotsComponentStack direction="horizontal" gapSize={16}>
    {new Array(total).fill(0).map((_, index) => (
      <Dot key={index} enabled={index < step} />
    ))}
  </S.DotsComponentStack>
);
