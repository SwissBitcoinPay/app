import { Link as RootLink, LinkProps as DomLinkProps } from "react-router-dom";
import { LinkProps as NativeLinkProps } from "react-router-native";
import { Merge } from "ts-essentials";

export const Link = RootLink as React.FC<Merge<DomLinkProps, NativeLinkProps>>;
