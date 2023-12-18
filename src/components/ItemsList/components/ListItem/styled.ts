import { Icon, Pressable, Text, View } from "@components";
import { platform } from "@config";
import { ScrollView } from "react-native";
import styled from "styled-components";

const { isNative } = platform;

export const ListItemContainer = styled(Pressable)`
  height: 80px;
  padding: 0px ${({ theme }) => theme.gridSize}px;
  flex-direction: row;
  align-items: center;
`;

export const ValueIcon = styled(Icon)`
  color: ${({ theme }) => theme.colors.white};
`;

export const LeftContainer = styled(View)<{ isNotSet?: boolean }>`
  margin-left: 16px;
  flex-direction: column;
  margin-top: ${({ isNotSet }) => (!isNotSet ? -6 : 0)}px;
  flex: 1;
  align-items: flex-start;
`;

type ValueType = {
  isNotSet?: boolean;
  isDisabled?: boolean;
  customColor?: string;
};

export const ValuesComponentScrollView = styled(ScrollView)`
  max-height: ${isNative ? 24 : 20.8}px;
`;

export const ListItemTitle = styled(Text)<ValueType>`
  color: ${({ theme, color }) => color || theme.colors.white};
  margin-bottom: ${({ isNotSet }) =>
    !isNotSet ? (isNative ? 2 : 4) : isNative ? -2 : 0}px;
`;

export const ListItemValue = styled(View)<ValueType>`
  ${({ theme, isNotSet, isDisabled, customColor }) => `
    background-color: ${
      customColor ||
      (!isNotSet
        ? isDisabled
          ? theme.colors.primaryLight
          : theme.colors.bitcoin
        : "transparent")
    };
    padding: 2px ${!isNotSet ? 8 : 0}px;
  `};

  border-radius: 100px;
`;

export const ListItemText = styled(Text).attrs(({ isNotSet }: ValueType) => ({
  h5: true,
  weight: 600,
  italic: isNotSet
}))<ValueType>`
  ${({ theme, isNotSet, isDisabled }) => `
    color: ${
      !isNotSet
        ? isDisabled
          ? theme.colors.grey
          : theme.colors.white
        : theme.colors.grey
    };

  `};
`;

export const EditIcon = styled(Icon)`
  color: ${({ theme }) => theme.colors.white};
  margin-left: 22px;
`;
