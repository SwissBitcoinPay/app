import styled from "styled-components";
import { ComponentStack, FieldDescription, Lottie } from "@components";

export const StepComponentStack = styled(ComponentStack)`
  align-items: center;
`;

const LOTTIE_SIZE = 110;

export const LottieSuccess = styled(Lottie)`
  height: ${LOTTIE_SIZE}px;
  width: ${LOTTIE_SIZE}px;
`;

export const CenteredFieldDescription = styled(FieldDescription)`
  text-align: center;
`;
