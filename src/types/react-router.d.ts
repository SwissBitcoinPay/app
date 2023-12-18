import { routesList } from "@config";

type RouteParams = "" | `/${string}`;
type SBPRoutes = {
  path:
    | `${(typeof routesList)[number]}`
    | `${(typeof routesList)[number]}${RouteParams}`;
  element: React.ReactElement;
};

declare module "react-router" {
  interface RouteProps extends SBPRoutes {}
}
