import { Suspense } from "react";
import { Router } from "@components/Router";
import { KeyboardAvoidingView, Loader } from "@components";
import {
  SBPContextProvider,
  SBPThemeContextProvider,
  SBPBitboxContextProvider,
  SBPModalContextProvider
} from "@config";
import App from "./App";
import { SafeAreaProvider, initialWindowMetrics } from "@components/SafeArea";
import "./config/i18n";

export const Root = () => (
  <Suspense fallback={<Loader />}>
    <SBPContextProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardAvoidingView>
          <Router>
            <SBPThemeContextProvider>
              <SBPModalContextProvider>
                <SBPBitboxContextProvider>
                  <App />
                </SBPBitboxContextProvider>
              </SBPModalContextProvider>
            </SBPThemeContextProvider>
          </Router>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </SBPContextProvider>
  </Suspense>
);
