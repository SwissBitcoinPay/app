import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputContentSizeChangeEventData,
  TextInputKeyPressEventData,
  TextInputSubmitEditingEventData
} from "react-native";
import { BaseField, QrScanWindow, QrModal, Text, View } from "@components";
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
import { platform } from "@config";

const { isWeb } = platform;

type TextInputProps = Omit<
  StyledComponentComponentProps<typeof S.TextInput>,
  "hasLeftBadge" | "hasRightBadge"
>;

type TextFieldProps = TextInputProps & {
  copyable?: boolean;
  pastable?: boolean | ((pastedValue?: string) => void);
  qrDisplayable?: boolean;
  qrDisplayValue?: string;
  qrScannable?: boolean;
  deletable?: boolean | (() => void);
  suggestions?: string[];
  charMask?: RegExp;
} & Pick<
    BaseFieldProps,
    "label" | "left" | "right" | "error" | "disabled" | "isLabelAsPlaceholder"
  >;

export const TextField = forwardRef<TextInput, TextFieldProps>(
  (
    {
      style,
      label: labelProps,
      value,
      onChange,
      onChangeText,
      left,
      right: rightProps,
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
      onSubmitEditing: onSubmitEditingProps,
      charMask,
      isLabelAsPlaceholder,
      ...props
    },
    ref
  ) => {
    const { colors } = useTheme();
    const { isCameraAvailable } = useContext(SBPContext);

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
        onFocus?.(e);
      },
      [onFocus]
    );

    const onBlurHandler = useCallback<NonNullable<BaseFieldProps["onBlur"]>>(
      (e) => {
        onBlur?.(e);
      },
      [onBlur]
    );

    const _onChangeText = useCallback(
      (v: string) => {
        if (charMask && v.length > 0 && !v.match(charMask)) return;
        onChangeText?.(v);
        onChange?.({ nativeEvent: { value: v } });
      },
      [charMask, onChange, onChangeText]
    );

    const onCopy = useCallback(() => {
      setIsCopied(true);
      Clipboard.setString(value || "");
      setTimeout(() => {
        setIsCopied(false);
      }, 1500);
    }, [value]);

    const onPaste = useCallback(async () => {
      const pastedValue = await Clipboard.getString();
      _onChangeText(pastedValue);
      if (typeof pastable === "function") {
        pastable(pastedValue);
      }
      setIsPasted(true);
      setTimeout(() => {
        setIsPasted(false);
      }, 1500);
    }, [_onChangeText, pastable]);

    const onToggleScanQrModal = useCallback(() => {
      setIsScanModalOpen(!isScanModalOpen);
    }, [isScanModalOpen]);

    const onScanQr = useCallback(
      (qrValue: string) => {
        _onChangeText(qrValue);
      },
      [_onChangeText]
    );

    const onToggleQrDisplayModal = useCallback(() => {
      setIsQrDisplayModalOpen(!isQrDisplayModalOpen);
    }, [isQrDisplayModalOpen]);

    const onDelete = useCallback(() => {
      setIsDeleted(true);
      _onChangeText("");
      if (typeof deletable === "function") {
        deletable();
      }
      setTimeout(() => {
        setIsDeleted(false);
      }, 1500);
    }, [_onChangeText, deletable]);

    const qrProps = useMemo(
      () => ({
        value: qrDisplayValue || value || ""
      }),
      [qrDisplayValue, value]
    );

    const withScan = useMemo(
      () => isCameraAvailable && qrScannable,
      [isCameraAvailable, qrScannable]
    );

    const label = useMemo(
      () => (labelProps !== undefined ? labelProps : ""),
      [labelProps]
    );

    const right = useMemo(
      () => [
        ...(rightProps ? tupulize(rightProps) : []),
        ...(qrScannable && isCameraAvailable
          ? [
              {
                icon: !qrDisplayable ? faQrcode : faCamera,
                onPress: onToggleScanQrModal
              }
            ]
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
      ],
      [
        copyable,
        deletable,
        isCameraAvailable,
        isCopied,
        isDeleted,
        isPasteAvailable,
        isPasted,
        onCopy,
        onDelete,
        onPaste,
        onToggleQrDisplayModal,
        onToggleScanQrModal,
        pastable,
        qrDisplayable,
        qrScannable,
        rightProps,
        value
      ]
    );

    const onContentSizeChange = useCallback(
      (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
        if (multiline) {
          setContentHeight(e.nativeEvent.contentSize.height);
        }
      },
      [multiline]
    );

    const onKeyPress = useCallback(
      (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
        const { nativeEvent } = e;
        if (!suggestions) return;
        if (
          nativeEvent?.key === "ArrowDown" &&
          suggestedIndex + 1 < suggestions?.length
        ) {
          setSuggestedIndex(suggestedIndex + 1);
        } else if (nativeEvent?.key === "ArrowUp" && suggestedIndex - 1 >= 0) {
          setSuggestedIndex(suggestedIndex - 1);
        }
      },
      [suggestedIndex, suggestions]
    );

    const onSubmitEditing = useCallback(
      (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
        if (suggestions && suggestions.length > 0) {
          _onChangeText(suggestions[suggestedIndex]);
          setSuggestedIndex(0);
        }
        onSubmitEditingProps?.(e);
      },
      [_onChangeText, onSubmitEditingProps, suggestedIndex, suggestions]
    );

    return (
      <S.TextFieldContainer style={style}>
        {withScan && (
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
            qrProps={qrProps}
          />
        )}
        <BaseField
          value={!!value}
          label={label}
          disabled={disabled}
          isFlexHeight={multiline}
          left={left}
          right={right}
          error={error}
          onFocus={onFocusHandler}
          onBlur={onBlurHandler}
          isDefaultFocused={props.autoFocus}
          isLabelAsPlaceholder={isLabelAsPlaceholder}
          component={
            <S.TextInput
              ref={ref}
              value={value}
              editable={!disabled}
              onChangeText={_onChangeText}
              multiline={multiline}
              style={StyleSheet.flatten([
                { height: contentHeight },
                isWeb && disabled && { cursor: "unset" }
              ])}
              onContentSizeChange={onContentSizeChange}
              onKeyPress={onKeyPress}
              onSubmitEditing={onSubmitEditing}
              isLabelAsPlaceholder={isLabelAsPlaceholder}
              {...props}
            />
          }
        />
        {suggestions && (
          <S.SuggestionsComponentStack
            gapSize={2}
            gapColor={colors.grey}
            isHidden={
              suggestions.length === 0 ||
              (suggestions.length === 1 && suggestions[0] === value)
            }
          >
            {suggestions?.map((suggestionValue, index) => (
              <S.SuggestionItem
                key={index}
                onMouseEnter={() => {
                  setSuggestedIndex(index);
                }}
                isHighlighted={index === suggestedIndex}
                onPress={() => {
                  _onChangeText(suggestionValue);
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
