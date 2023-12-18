import React, { ComponentProps } from "react";
import { ComponentStack } from "@components";
import { ListItem } from "./components/ListItem";
import { useTheme } from "styled-components";

type ItemsListProps = {
  headerComponent?: React.ReactNode;
  items: ComponentProps<typeof ListItem>[];
};

export const ItemsList = ({ headerComponent, items }: ItemsListProps) => {
  const { colors } = useTheme();
  return (
    <ComponentStack gapSize={2} gapColor={colors.primaryLight}>
      {headerComponent}
      {items.map((item, index) => (
        <ListItem key={index} {...item} />
      ))}
    </ComponentStack>
  );
};
