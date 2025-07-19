import { useContext } from "react";
import { SBPAskPasswordModalContext } from "@config";

export const useAskPassword = () => {
  const { askPassword } = useContext(SBPAskPasswordModalContext);
  return askPassword;
};
