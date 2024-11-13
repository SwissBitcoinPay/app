import React, { PropsWithChildren, createContext, useState } from "react";

type SBPModalContextType = {
  overlayComponent?: React.ReactNode;
  setModalOverlayComponent: (value?: React.ReactNode) => void;
};

// @ts-ignore
export const SBPModalContext = createContext<SBPModalContextType>({});

export const SBPModalContextProvider = ({ children }: PropsWithChildren) => {
  const [overlayComponent, setModalOverlayComponent] =
    useState<React.ReactNode>();

  return (
    <SBPModalContext.Provider
      value={{
        overlayComponent,
        setModalOverlayComponent
      }}
    >
      {children}
    </SBPModalContext.Provider>
  );
};
