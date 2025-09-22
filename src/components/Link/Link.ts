import { Link as RootLink, LinkProps as DomLinkProps } from "react-router";
import { LinkProps as NativeLinkProps } from "react-router";
import { Merge } from "ts-essentials";

export const Link = RootLink as React.FC<Merge<DomLinkProps, NativeLinkProps>>;
