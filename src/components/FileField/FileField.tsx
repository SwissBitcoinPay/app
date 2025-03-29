import { useCallback } from "react";
import { Loader, Text } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { StyledComponentComponentProps } from "@types";
import { faFileUpload, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "styled-components";
import * as S from "./styled";
import { useTranslation } from "react-i18next";

type FileFieldProps = {
  backgroundComponent?: React.ReactNode;
  isLoading?: boolean;
} & StyledComponentComponentProps<typeof S.FilePicker> &
  Pick<
    BaseFieldProps,
    | "value"
    | "label"
    | "left"
    | "right"
    | "error"
    | "disabled"
    | "isLabelAsPlaceholder"
  >;

export const FileField = ({
  style,
  label,
  value,
  isLoading,
  error,
  isLabelAsPlaceholder,
  disabled = isLoading,
  onChange,
  backgroundComponent,
  ...props
}: FileFieldProps) => {
  const { colors } = useTheme();
  const { i18n } = useTranslation();

  const onDelete = useCallback(() => {
    onChange({ target: { files: null } });
  }, [onChange]);

  return (
    <>
      <S.FileBaseField
        style={style}
        value={value || i18n.t("common.selectFile")}
        label={label}
        disabled={disabled}
        valueColor={colors.white}
        right={
          isLoading ? (
            <Loader size={24} />
          ) : value ? (
            { icon: faTrash, onPress: onDelete, color: colors.white }
          ) : (
            { icon: faFileUpload, color: colors.white }
          )
        }
        error={error}
        isLabelAsPlaceholder={isLabelAsPlaceholder}
        component={
          <>
            {!value && !disabled && (
              <S.FilePicker {...props} onChange={onChange} />
            )}
            {backgroundComponent}
          </>
        }
      />
    </>
  );
};
