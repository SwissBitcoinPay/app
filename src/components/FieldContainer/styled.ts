import { ComponentStack, View } from "@components";
import styled from "styled-components";

export const FieldTitleContainer = styled(ComponentStack)<{ isOpen?: boolean }>`
  height: 53px;
  padding: 0px 12px;
  position: relative;
  bottom: -10px;

  ${({ theme, isOpen }) => `
    border: 3px solid ${theme.colors.primaryLight};
    border-radius: ${theme.borderRadius}px;

    ${
      isOpen
        ? `
              border-bottom-left-radius: 0px;
              border-bottom-right-radius: 0px;
              padding-bottom: 9px;
              border-bottom-width: 0px;
            `
        : "margin-bottom: 10px;"
    }
  `}
`;

export const TitleRightContainer = styled(View)`
  flex: 1;
  flex-direction: row;
  justify-content: flex-end;
`;
