import { ComponentProps, useContext } from "react";
import { StyledComponentComponentProps } from "@types";
import { useIsScreenSizeMin } from "@hooks";
import { SBPContext } from "@config";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, View } from "@components";
import * as S from "./styled";

type PageContainerProps = Omit<
  StyledComponentComponentProps<typeof S.StyledPageContainer>,
  "isLarge" | "headerHeight" | "bottomHeight" | "windowWidth"
> & {
  header?: StyledComponentComponentProps<typeof S.PageHeader>;
  footerButton?: ComponentProps<typeof Button>;
};

export const PageContainer = ({
  children,
  header,
  footerButton,
  noBottomMargin,
  noVerticalPadding,
  ...props
}: PageContainerProps) => {
  const isLarge = useIsScreenSizeMin("large");
  const { headerHeight, setHeaderHeight } = useContext(SBPContext);
  const { width } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();

  return (
    <>
      <S.StyledPageContainer
        {...props}
        headerHeight={header ? headerHeight : top}
        bottomHeight={bottom}
        isLarge={isLarge}
        windowWidth={width}
        noBottomMargin={noBottomMargin}
        keyboardShouldPersistTaps="handled"
        noVerticalPadding={noVerticalPadding}
      >
        {!header || headerHeight ? children : null}
        {footerButton && <S.PageFooterGap />}
        {bottom > 0 && !noBottomMargin && !noVerticalPadding && (
          <View style={{ height: bottom }} />
        )}
      </S.StyledPageContainer>
      {footerButton && (
        <S.PageFooterButton
          type="bitcoin"
          {...footerButton}
          bottomHeight={bottom}
          isLarge={isLarge}
          windowWidth={width}
        />
      )}
      <S.PageHeader
        isVisible={!!header}
        title=""
        {...(!headerHeight
          ? {
              onLayout: (e) => {
                setHeaderHeight(e?.nativeEvent?.layout?.height || top);
              }
            }
          : {})}
        isLarge={isLarge}
        {...header}
      />
    </>
  );
};
