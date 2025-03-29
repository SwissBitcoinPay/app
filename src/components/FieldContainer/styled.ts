import { ComponentStack } from "@components";
import { FIELD_BORDER_WIDTH } from "@components/BaseField/styled";
import styled from "styled-components";

export const StyledFieldContainer = styled(ComponentStack)`
  border: ${FIELD_BORDER_WIDTH}px solid
    ${({ theme }) => theme.colors.primaryLight};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  background-color: ${({ theme }) => theme.colors.primaryLight};
`;

export const FieldTitleContainer = styled(ComponentStack)`
  padding: 12px 12px;
  padding-bottom: 0px;
  padding-top: 0px;
  position: relative;
`;
