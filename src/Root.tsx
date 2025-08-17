import { Suspense } from "react";
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
  SBPTrezorContextProvider
} from "@config";
import App from "./App";
import { SafeAreaProvider, initialWindowMetrics } from "@components/SafeArea";
import "./config/i18n";

const { isIos } = platform;

export const Root = () => (
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
                          <App />
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
