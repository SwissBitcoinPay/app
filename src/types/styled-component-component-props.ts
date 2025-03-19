import { ComponentPropsWithRef } from "react";
import { AnyStyledComponent } from "styled-components";

export type StyledComponentComponentProps<T extends AnyStyledComponent> =
  ComponentPropsWithRef<T> & T extends AnyStyledComponent
    ? React.ComponentProps<T>
    : never;