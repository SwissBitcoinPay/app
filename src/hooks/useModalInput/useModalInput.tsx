import {
  PropsWithChildren,
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  NativeSyntheticEvent,
  TextInputChangeEventData,
  TextInputKeyPressEventData
} from "react-native";
import { useTranslation } from "react-i18next";
import { ComponentStack, Modal } from "@components";
import { CheckboxEventData } from "@components/CheckboxField/CheckboxField";
import { XOR } from "ts-essentials";
import { FieldDescription } from "@components";

type UseModalInputParams<T = string | number | boolean> = {
  element: React.ReactElement;
  label: string;
  description?: string | React.ReactElement;
  defaultValue?: T;
  onChange: (value: T) => boolean | Promise<boolean>;
  validate?: (value: T) => boolean;
};

export const useModalInput = <T extends string | number | boolean>({
  element,
  label,
  description,
  defaultValue,
  onChange,
  validate
}: UseModalInputParams<T>) => {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [tmpValue, setTmpValue] = useState<T>();

  useEffect(() => {
    setTmpValue(defaultValue);
  }, [defaultValue]);

  const onChangeHandler = useCallback(
    (
      e: NativeSyntheticEvent<XOR<TextInputChangeEventData, CheckboxEventData>>
    ) => {
      const { text, value } = e.nativeEvent;
      setTmpValue((text || value) as T);
    },
    []
  );

  const isValid = useMemo(() => {
    return validate?.((tmpValue || "") as T) || true;
  }, [validate, tmpValue]);

  const onSubmit = useCallback(async () => {
    if (!isValid || tmpValue === undefined) return;
    setIsLoading(true);
    if (await onChange(tmpValue)) {
      setIsOpen(false);
    }
    setIsLoading(false);
  }, [isValid, onChange, tmpValue]);

  const onKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === "Enter") {
        onSubmit();
      }
    },
    [onSubmit]
  );

  const modal = useMemo(
    () => (
      <Modal
        title={label}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        submitButton={{
          title: t("common.submit"),
          isLoading: isLoading,
          disabled: !isValid || isLoading,
          onPress: onSubmit
        }}
      >
        <ComponentStack gapSize={10}>
          {cloneElement(element, {
            label,
            value: tmpValue,
            onChange: onChangeHandler,
            onKeyPress: onKeyPress
          })}
          {typeof description === "string" ? (
            <ModalInputDescription>{description}</ModalInputDescription>
          ) : (
            description
          )}
        </ComponentStack>
      </Modal>
    ),
    [
      description,
      element,
      isLoading,
      isOpen,
      isValid,
      label,
      onChangeHandler,
      onKeyPress,
      onSubmit,
      t,
      tmpValue
    ]
  );

  const onPressElement = useCallback(() => {
    setIsOpen(true);
  }, []);

  return { modal, isOpen, onPressElement };
};

export const ModalInputDescription = ({ children }: PropsWithChildren) => (
  <FieldDescription h4 weight={500}>
    {children}
  </FieldDescription>
);
