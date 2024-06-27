import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { TextInput } from "react-native";
import { BaseField, QrScanWindow, QrModal, Text } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { StyledComponentComponentProps } from "@types";
import { Clipboard, tupulize } from "@utils";
import {
  faCamera,
  faCheck,
  faClipboard,
  faCopy,
  faQrcode,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { SBPContext } from "@config";
import { useTheme } from "styled-components";
import * as S from "./styled";

type TextInputProps = Omit<
  StyledComponentComponentProps<typeof S.TextInput>,
  "hasLeftBadge" | "hasRightBadge"
>;

type TextFieldProps = TextInputProps & {
  copyable?: boolean;
  pastable?: boolean;
  qrDisplayable?: boolean;
  qrDisplayValue?: string;
  qrScannable?: boolean;
  deletable?: boolean | (() => void);
  suggestions?: string[];
} & Pick<BaseFieldProps, "label" | "left" | "right" | "error" | "disabled">;

export const TextField = forwardRef<TextInput, TextFieldProps>(
  (
    {
      style,
      label,
      value,
      onChangeText,
      left,
      right,
      error,
      onFocus,
      onBlur,
      copyable,
      pastable,
      qrDisplayable,
      qrDisplayValue,
      qrScannable,
      deletable,
      suggestions,
      disabled,
      multiline,
      onSubmitEditing,
      ...props
    },
    ref
  ) => {
    const { colors } = useTheme();
    const { isCameraAvailable } = useContext(SBPContext);

    const [isFocused, setIsFocused] = useState(props.autoFocus);

    const [isCopied, setIsCopied] = useState(false);
    const [isPasted, setIsPasted] = useState(false);
    const [isDeleted, setIsDeleted] = useState(false);
    const [isPasteAvailable, setIsPasteAvailable] = useState(false);
    const [isScanModalOpen, setIsScanModalOpen] = useState(false);
    const [isQrDisplayModalOpen, setIsQrDisplayModalOpen] = useState(false);
    const [suggestedIndex, setSuggestedIndex] = useState(0);
    const [contentHeight, setContentHeight] = useState<number>();

    useEffect(() => {
      if (pastable) {
        setIsPasteAvailable(Clipboard.isReadTextAvailable);
      }
    }, [pastable]);

    const onFocusHandler = useCallback<NonNullable<BaseFieldProps["onFocus"]>>(
      (e) => {
        setIsFocused(true);
        onFocus?.(e);
      },
      [onFocus]
    );

    const onBlurHandler = useCallback<NonNullable<BaseFieldProps["onBlur"]>>(
      (e) => {
        setIsFocused(false);
        onBlur?.(e);
      },
      [onBlur]
    );

    const onCopy = useCallback(() => {
      setIsCopied(true);
      Clipboard.setString(value || "");
      setTimeout(() => {
        setIsCopied(false);
      }, 1500);
    }, [value]);

    const onPaste = useCallback(async () => {
      setIsPasted(true);
      onChangeText?.(await Clipboard.getString());
      setTimeout(() => {
        setIsPasted(false);
      }, 1500);
    }, [onChangeText]);

    const onToggleScanQrModal = useCallback(() => {
      setIsScanModalOpen(!isScanModalOpen);
    }, [isScanModalOpen]);

    const onScanQr = useCallback(
      (qrValue: string) => {
        onChangeText?.(qrValue);
      },
      [onChangeText]
    );

    const onToggleQrDisplayModal = useCallback(() => {
      setIsQrDisplayModalOpen(!isQrDisplayModalOpen);
    }, [isQrDisplayModalOpen]);

    const onDelete = useCallback(() => {
      setIsDeleted(true);
      onChangeText?.("");
      if (typeof deletable === "function") {
        deletable();
      }
      setTimeout(() => {
        setIsDeleted(false);
      }, 1500);
    }, [onChangeText, deletable]);

    return (
      <S.TextFieldContainer style={style}>
        {isCameraAvailable && qrScannable && (
          <QrScanWindow
            isOpen={isScanModalOpen}
            onClose={onToggleScanQrModal}
            onScan={onScanQr}
          />
        )}
        {qrDisplayable && (
          <QrModal
            title={label}
            isOpen={isQrDisplayModalOpen}
            onClose={onToggleQrDisplayModal}
            qrProps={{
              value: qrDisplayValue || value || ""
            }}
          />
        )}
        <BaseField
          value={!!value}
          label={label !== undefined ? label : ""}
          disabled={disabled}
          isFlexHeight={multiline}
          left={left}
          right={[
            ...(right ? tupulize(right) : []),
            ...(qrScannable && isCameraAvailable
              ? [{ icon: faCamera, onPress: onToggleScanQrModal }]
              : []),
            ...(qrDisplayable
              ? [
                  {
                    icon: faQrcode,
                    onPress: onToggleQrDisplayModal,
                    isAlwaysClickable: true
                  }
                ]
              : []),
            ...(copyable
              ? [
                  {
                    icon: isCopied ? faCheck : faCopy,
                    onPress: onCopy,
                    isAlwaysClickable: true
                  }
                ]
              : []),
            ...(pastable && isPasteAvailable
              ? [{ icon: isPasted ? faCheck : faClipboard, onPress: onPaste }]
              : []),
            ...(deletable && value
              ? [
                  {
                    icon: isDeleted ? faCheck : faTrash,
                    onPress: onDelete,
                    isAlwaysClickable: true
                  }
                ]
              : [])
          ]}
          error={error}
          onFocus={onFocusHandler}
          onBlur={onBlurHandler}
          isDefaultFocused={props.autoFocus}
          component={
            <S.TextInput
              ref={ref}
              value={value}
              editable={!disabled}
              onChangeText={onChangeText}
              multiline={multiline}
              style={{ height: contentHeight }}
              onContentSizeChange={(e) => {
                if (multiline) {
                  setContentHeight(e.nativeEvent.contentSize.height);
                }
              }}
              onKeyPress={(e) => {
                const { nativeEvent } = e;
                if (!suggestions) return;
                if (
                  nativeEvent?.key === "ArrowDown" &&
                  suggestedIndex + 1 < suggestions?.length
                ) {
                  setSuggestedIndex(suggestedIndex + 1);
                } else if (
                  nativeEvent?.key === "ArrowUp" &&
                  suggestedIndex - 1 >= 0
                ) {
                  setSuggestedIndex(suggestedIndex - 1);
                }
              }}
              onSubmitEditing={(e) => {
                if (suggestions && suggestions.length > 0) {
                  onChangeText?.(suggestions[suggestedIndex]);
                  setSuggestedIndex(0);
                }
                onSubmitEditing?.(e);
              }}
              {...props}
            />
          }
        />
        {suggestions && suggestions.length > 0 && isFocused && (
          <S.SuggestionsComponentStack gapSize={1} gapColor={colors.grey}>
            {suggestions.map((suggestionValue, index) => (
              <S.SuggestionItem
                key={index}
                isHighlighted={index === suggestedIndex}
                onPress={() => {
                  onChangeText?.(suggestionValue);
                  setSuggestedIndex(0);
                }}
              >
                <Text h4 weight={500}>
                  {suggestionValue}
                </Text>
              </S.SuggestionItem>
            ))}
          </S.SuggestionsComponentStack>
        )}
      </S.TextFieldContainer>
    );
  }
);
