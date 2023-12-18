import { Location } from "react-router";

declare module "react-router" {
  export declare function useLocation<T>(): Location<T | null>;
}
