import { Routes, Route } from "@components/Router";
import { StatusBar, TopLeftLogo } from "@components";
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
import { initialize } from "react-native-embrace";
import {
  useAccountConfig,
  useBackHandler,
  useDeepLink,
  useRefCode,
  useSplashScreen
} from "@hooks";
import { useEffect } from "react";

const App = () => {
  const { accountConfig } = useAccountConfig({ refresh: false });

  useDeepLink();
  useRefCode();
  useBackHandler();
  useSplashScreen();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
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
      <TopLeftLogo />
    </>
  );
};

export default App;
