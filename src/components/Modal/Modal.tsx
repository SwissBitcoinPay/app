import { faTimes } from "@fortawesome/free-solid-svg-icons";
import React, { ComponentProps, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal as RootModal } from "react-native";
import { ArrayOrSingle } from "ts-essentials";
import { Button, KeyboardAvoidingView } from "@components";
import { ScrollView } from "react-native";
import { useIsScreenSizeMin } from "@hooks";
import { platform } from "@config";
import * as S from "./styled";

const { isNative, isAndroid } = platform;

const ANIMATION_DURATION = 250;

const animationValues = {
  opacity: [0, 1],

  scale: [0.96, 1],
  translateY: [5, 0]
};

const AnimatedModalBackground = Animated.createAnimatedComponent(
  S.ModalBackground
);
const AnimatedModalContent = Animated.createAnimatedComponent(S.ModalContent);

type ModalProps = {
  title?: string;
  onClose: () => void;
  isOpen: boolean;
  children: ArrayOrSingle<React.ReactElement>;
  submitButton?: ComponentProps<typeof Button>;
  noScrollView?: boolean;
};

export const Modal = ({
  title,
  onClose,
  isOpen,
  children,
  submitButton,
  noScrollView = false
}: ModalProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const isExtraLarge = useIsScreenSizeMin("extraLarge");

  const opacity = useRef(
    new Animated.Value(animationValues.opacity[+isOpen])
  ).current;

  const scale = useRef(
    new Animated.Value(animationValues.scale[+isOpen])
  ).current;
  const translateY = useRef(
    new Animated.Value(animationValues.translateY[+isOpen])
  ).current;

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: animationValues.opacity[+isOpen],
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease)
      }),
      Animated.timing(scale, {
        toValue: animationValues.scale[+isOpen],
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease)
      }),
      Animated.timing(translateY, {
        toValue: animationValues.translateY[+isOpen],
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease)
      })
    ]).start(() => {
      if (!isOpen) {
        setIsVisible(false);
      }
    });
  }, [isOpen]);

  return (
    <RootModal
      visible={isVisible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => {
        // TODO: Ask confirmation?
        onClose();
      }}
    >
      <KeyboardAvoidingView>
        <AnimatedModalBackground style={{ opacity }}>
          <AnimatedModalContent
            isScreenExtraLarge={isExtraLarge}
            style={{ transform: [{ scale }, { translateY }] }}
          >
            <S.ModalHeader>
              <S.HeaderText weight={700}>{title}</S.HeaderText>
              <S.HeaderIconPressable onPress={onClose}>
                <S.HeaderIcon size={24} icon={faTimes} />
              </S.HeaderIconPressable>
            </S.ModalHeader>
            {!noScrollView ? (
              <ScrollView
                keyboardShouldPersistTaps="always"
                style={{
                  overflow: isNative && isAndroid ? "hidden" : undefined,
                  zIndex: 1
                }}
                contentContainerStyle={{ overflow: "hidden" }}
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
            {submitButton && (
              <S.SubmitButton type="bitcoin" {...submitButton} />
            )}
          </AnimatedModalContent>
        </AnimatedModalBackground>
      </KeyboardAvoidingView>
    </RootModal>
  );
};
