import { ToastProps } from "react-native-toast-notifications/lib/typescript/toast";
import {
  faCheckCircle,
  faTimesCircle,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import * as S from "./styled";

export const Toast = ({ message, type }: ToastProps) => {
  return (
    <S.ToastContainer type={type} direction="horizontal" gapSize={8}>
      <S.ToastIcon
        size={24}
        icon={
          type === "success"
            ? faCheckCircle
            : type === "info"
            ? faWarning
            : faTimesCircle
        }
      />
      <S.ToastText>{message}</S.ToastText>
    </S.ToastContainer>
  );
};
