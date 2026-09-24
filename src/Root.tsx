import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "@components/Router";
import { KeyboardAvoidingView, Loader, SplashScreen } from "@components";
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

// The native splash is only hidden once <App /> mounts. If the bootstrap
// fails (offline, API unreachable), hide it anyway so the user isn't stuck on
// it while retries are in progress.
const BootstrapLoader = ({ hasFailed }: { hasFailed: boolean }) => {
  const { t } = useTranslation(undefined, { keyPrefix: "common.errors" });

  useEffect(() => {
    if (hasFailed) SplashScreen.hide({ fade: true });
  }, [hasFailed]);

  return <Loader reason={hasFailed ? t("serverUnreachable") : undefined} />;
};

const Root = () => {
  const isApiReady = useApiReady({ storage: AsyncStorage });
  const { isReady: isConfigReady, hasFailed: hasConfigFailed } =
    useRuntimeConfigReady(isApiReady);
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
                            {isBootstrapped ? (
                              <App />
                            ) : (
                              <BootstrapLoader hasFailed={hasConfigFailed} />
                            )}
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
