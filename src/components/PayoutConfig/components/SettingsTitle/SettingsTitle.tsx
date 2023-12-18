import { useTheme } from "styled-components";
import { Text } from "@components";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import * as S from "./styled";

type SettingsTitleProps = {
  title: string;
  isValid: boolean;
};

export const SettingsTitle = ({ title, isValid }: SettingsTitleProps) => {
  const { colors } = useTheme();

  return (
    <S.TitleStack direction="horizontal" gapSize={10} isValid={isValid}>
      <Text h3 weight={600} color={isValid ? colors.white : colors.white}>
        {title}
      </Text>
      {isValid && (
        <S.Icon color={colors.white} icon={faCheckCircle} size={22} />
      )}
    </S.TitleStack>
  );
};
