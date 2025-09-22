import { Routes, Route, useNavigate } from "@components/Router";
import { TopLeftLogo } from "@components";
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
  Invoice,
  Download,
  Aml
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
import { useEffect, useState } from "react";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react-native";
import "./config/sentry.config";

const ErrorComponent = ({ resetError }: FallbackComponentProps) => {
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    toast.show(t("common.errors.unknown"), {
      type: "error"
    });
    resetError();
  }, []);

  return null;
};

const App = () => {
  const toast = useToast();
  const [isToastLoaded, setIsToastLoaded] = useState(false);

  const { accountConfig } = useAccountConfig({
    refresh: false,
    listenAppState: true
  });
  const navigate = useNavigate();

  const getIsToastLoaded = () => Object.entries(toast).length === 0;

  useEffect(() => {
    if (getIsToastLoaded()) {
      setIsToastLoaded(true);
    }
  }, [getIsToastLoaded()]);

  useDeepLink();
  useRefCode();
  useBackHandler();
  useSplashScreen();

  return isToastLoaded ? (
    <>
      <ErrorBoundary
        FallbackComponent={ErrorComponent}
        onError={(error) => {
          if (error) {
            Sentry.captureException(error, {
              captureContext: { user: { id: accountConfig?.id } }
            });
          }
          navigate("/");
        }}
      >
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
          <Route path="download" element={<Download />} />
          <Route path="connect/:id" element={<Connect />} />
          <Route path="invoice/:id?" element={<Invoice />} />
          <Route path="aml/:id?" element={<Aml />} />
        </Routes>
      </ErrorBoundary>
      <TopLeftLogo />
    </>
  ) : null;
};

export default App;
