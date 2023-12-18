import { ComponentPropsWithRef } from "react";
import { Merge } from "ts-essentials";
import {
  AnyStyledComponent,
  StyledComponentInnerComponent,
  StyledComponentInnerOtherProps
} from "styled-components";

export type StyledComponentComponentProps<T extends AnyStyledComponent> = Merge<
  ComponentPropsWithRef<StyledComponentInnerComponent<T>>,
  StyledComponentInnerOtherProps<T>
>;