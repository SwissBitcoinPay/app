import { Suspense, useEffect, useState } from "react";
import { Router } from "@components/Router";
import { KeyboardAvoidingView, Loader } from "@components";
import {
  SBPContextProvider,
  SBPThemeContextProvider,
  SBPBitboxContextProvider,
  SBPModalContextProvider,
  platform,
  SBPHardwareWalletContextProvider,
  SBPLedgerContextProvider,
  SBPAskPasswordModalContextProvider,
  SBPTrezorContextProvider,
  useRuntimeConfigReady
} from "@config";
import App from "./App";
import { SafeAreaProvider, initialWindowMetrics } from "@components/SafeArea";
import { AsyncStorage } from "@utils";
import { useApiReady } from "@types";
import "./config/i18n";

const { isIos } = platform;

const Root = () => {

  const isApiReady = useApiReady({ storage: AsyncStorage });
  const isConfigReady = useRuntimeConfigReady(isApiReady);
  const isBootstrapped = isApiReady && isConfigReady;

  return (
    <Suspense fallback={<Loader />}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardAvoidingView>
          <Router
            future={{ v7_startTransition: !isIos, v7_relativeSplatPath: true }}
          >
            <SBPContextProvider>
              <SBPThemeContextProvider>
                <SBPAskPasswordModalContextProvider>
                  <SBPModalContextProvider>
                    <SBPTrezorContextProvider>
                      <SBPLedgerContextProvider>
                        <SBPBitboxContextProvider>
                          <SBPHardwareWalletContextProvider>
                            {isBootstrapped ? <App /> : <Loader />}
                          </SBPHardwareWalletContextProvider>
                        </SBPBitboxContextProvider>
                      </SBPLedgerContextProvider>
                    </SBPTrezorContextProvider>
                  </SBPModalContextProvider>
                </SBPAskPasswordModalContextProvider>
              </SBPThemeContextProvider>
            </SBPContextProvider>
          </Router>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Suspense>
  );
};

export default Root;
