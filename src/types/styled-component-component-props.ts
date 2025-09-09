import { ComponentPropsWithRef } from "react";
import { IStyledComponent } from "styled-components";

export type StyledComponentComponentProps<T extends IStyledComponent<any, any>> =
  ComponentPropsWithRef<T> & T extends IStyledComponent<any, any>
    ? React.ComponentProps<T>
    : never;