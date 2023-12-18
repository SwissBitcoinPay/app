import { CircleSnail, CircleSnailPropTypes } from "react-native-progress";
import { useTheme } from "styled-components";
import * as S from "./styled";

type LoaderProps = CircleSnailPropTypes & {
  reason?: string;
};

const DEFAULT_SIZE = 32;

export const Loader = ({
  size = DEFAULT_SIZE,
  reason,
  ...props
}: LoaderProps) => {
  const { colors } = useTheme();

  return (
    <>
      <CircleSnail
        size={size}
        duration={900}
        spinDuration={2000}
        thickness={size / 8}
        indeterminate
        color={colors.white}
        {...props}
      />
      {reason && (
        <S.LoaderReason h4 weight={700}>
          {reason}
        </S.LoaderReason>
      )}
    </>
  );
};
