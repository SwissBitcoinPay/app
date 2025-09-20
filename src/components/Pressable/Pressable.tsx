import { forwardRef, useMemo } from "react";
import {
  Pressable as RootPressable,
  PressableProps as RootPressableProps,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps
} from "react-native";
import { useNavigate } from "@components/Router";
import { Link } from "@components";
import { routesList } from "@config";
import { NavigateOptions } from "react-router";
import { platform } from "@config";
import { Linking } from "@utils";

const { isAndroid, isNative } = platform;

type PressableComponentProps = RootPressableProps & TouchableOpacityProps;

type Route =
  | `${(typeof routesList)[number]}`
  | `/${(typeof routesList)[number]}`
  | `/${(typeof routesList)[number]}/${string}`;

type PressableProps = Omit<PressableComponentProps, "onPress"> & {
  onPress:
    | PressableComponentProps["onPress"]
    | Route
    | [Route, NavigateOptions]
    | `https://${string}`
    | `http://${string}`
    | `bitcoin:${string}`
    | `lightning:${string}`
    | `mailto:${string}`
    | -1;
};

export const Pressable = forwardRef<TouchableOpacity, PressableProps>(
  ({ onPress: _onPress, ...props }, ref) => {
    const navigate = useNavigate();

    const onPress = useMemo(() => {
      if (props.disabled) {
        return () => null;
      }

      if (typeof _onPress === "function" || !_onPress) {
        return _onPress;
      }

      if (_onPress === -1) {
        return () => navigate(-1);
      }

      const isArray = Array.isArray(_onPress);

      const newRoute = isArray ? _onPress[0] : _onPress;

      if (routesList.find((route) => newRoute.startsWith(`/${route}`))) {
        if (isNative) {
          return () => navigate(newRoute, isArray ? _onPress?.[1] : undefined);
        } else {
          return newRoute;
        }
      }

      if (typeof _onPress === "string") {
        if (isNative) {
          return async () => {
            if (await Linking.canOpenURL(_onPress)) {
              await Linking.openURL(_onPress);
            }
          };
        } else {
          return _onPress;
        }
      }
    }, [_onPress, navigate, props.disabled]);

    const pressableComponent = useMemo(
      () =>
        typeof onPress === "string" ? (
          <Link
            style={StyleSheet.flatten([{ display: "flex" }, props.style])}
            to={onPress}
            state={Array.isArray(_onPress) ? _onPress[1].state : undefined}
            underlayColor="transparent"
            target={onPress.startsWith("https://") ? "_blank" : undefined}
          >
            {props.children}
          </Link>
        ) : isAndroid ? (
          <RootPressable {...props} onPress={onPress} />
        ) : (
          <TouchableOpacity
            ref={ref}
            activeOpacity={0.7}
            {...props}
            onPress={onPress}
          />
        ),
      [_onPress, onPress, props, ref]
    );

    return pressableComponent;
  }
);
