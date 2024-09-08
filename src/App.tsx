import { Routes, Route, useNavigate } from "@components/Router";
import { Button, StatusBar, Text, TopLeftLogo } from "@components";
import {
  Welcome,
  QRScanner,
  Pos,
  Connect,
  History,
  Signup,
  Wallet,
  Settings,
  PayoutConfigScreen,
  EmailLogin,
  SignatureLogin,
  Invoice
} from "@screens";
import {
  useAccountConfig,
  useBackHandler,
  useDeepLink,
  useRefCode,
  useSplashScreen
} from "@hooks";
import ErrorBoundary, {
  FallbackComponentProps
} from "react-native-error-boundary";
import { useEffect } from "react";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react-native";
import "./config/sentry.config";

const ErrorComponent = ({ error, resetError }: FallbackComponentProps) => {
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    Sentry.captureException(error);
    toast.show(t("common.errors.unknown"), {
      type: "error"
    });
    resetError();
  }, []);
  return null;
};

const App = () => {
  const { accountConfig } = useAccountConfig({ refresh: false });
  const navigate = useNavigate();

  useDeepLink();
  useRefCode();
  useBackHandler();
  useSplashScreen();

  return (
    <>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <ErrorBoundary
        FallbackComponent={ErrorComponent}
        onError={() => {
          navigate("/");
        }}
      >
        <Button
          style={{ marginTop: 100 }}
          onPress={() => {
            Sentry.captureException(new Error("My error test"));
          }}
        />
        <Routes>
          {
            <Route
              path="/"
              element={accountConfig?.apiKey ? <Pos /> : <Welcome />}
            />
          }
          <Route path="qr-scanner" element={<QRScanner />} />
          <Route path="settings" element={<Settings />} />
          <Route path="payout-config" element={<PayoutConfigScreen />} />
          <Route path="signup" element={<Signup />} />
          <Route path="email-login" element={<EmailLogin />} />
          <Route path="signature-login" element={<SignatureLogin />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="history" element={<History />} />
          <Route path="connect/:id" element={<Connect />} />
          <Route path="invoice/:id?" element={<Invoice />} />
        </Routes>
      </ErrorBoundary>
      <TopLeftLogo />
    </>
  );
};

export default App;
