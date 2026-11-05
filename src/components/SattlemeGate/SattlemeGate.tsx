import { PropsWithChildren } from "react";

// Sur un téléphone, rien : l'app sattle.me remplace celle-ci sur les stores
// et relit elle-même ce qu'elle a laissé. Sur le web : SattlemeGate.web.tsx.
export const SattlemeGate = ({ children }: PropsWithChildren) => (
  <>{children}</>
);
