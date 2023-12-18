import styled from "styled-components";
import { ComponentStack, FieldDescription, Lottie } from "@components";

export const CenteredFieldDescription = styled(FieldDescription)`
  text-align: center;
`;

export const WordNumberContainer = styled(ComponentStack)`
  justify-content: center;
`;

const LOTTIE_SIZE = 34;

export const LottieSuccess = styled(Lottie)`
  height: ${LOTTIE_SIZE}px;
  width: ${LOTTIE_SIZE}px;
`;
