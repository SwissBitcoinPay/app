import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockAccountsMe = jest.fn();
const mockSetAccountConfig = jest.fn();
const mockSetUserType = jest.fn();
const mockStorageGetItem = jest.fn();
const mockStorageSetItem = jest.fn();
const mockToastShow = jest.fn();
const mockClientTokens = jest.fn();
const mockClientLogout = jest.fn();
const mockUseEffect = jest.fn();

jest.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useContext: () => ({
    accountConfig: undefined,
    setAccountConfig: mockSetAccountConfig,
    setUserType: mockSetUserType
  }),
  useEffect: (effect: unknown, dependencies?: unknown) =>
    mockUseEffect(effect as never, dependencies as never),
  useRef: (current: unknown) => ({ current }),
  useState: (initialValue: unknown) => [initialValue, jest.fn()]
}));

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn(),
    currentState: "active",
    isAvailable: false
  }
}));

jest.mock("@config/settingsKeys", () => ({
  keyStoreAccountConfig: "accountConfig",
  keyStoreDeviceName: "deviceName",
  keyStoreHmac: "hmac",
  keyStoreIsGuest: "isGuest"
}));

jest.mock("@config", () => ({
  apiRootUrl: "https://api.example.com",
  appRootUrl: "https://app.example.com",
  SBPContext: {}
}));

jest.mock("@utils", () => ({
  AsyncStorage: {
    getItem: (key: unknown) => mockStorageGetItem(key as never),
    setItem: (key: unknown, value: unknown) =>
      mockStorageSetItem(key as never, value as never)
  }
}));

jest.mock("@components/Router", () => ({
  useNavigate: () => jest.fn()
}));

jest.mock("react-native-toast-notifications", () => ({
  useToast: () => ({ show: mockToastShow })
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

jest.mock("@types", () => ({
  api: {
    accounts: {
      me: (auth?: unknown) => mockAccountsMe(auth as never)
    }
  },
  client: {
    checkCookies: jest.fn(),
    login: jest.fn(),
    logout: () => mockClientLogout(),
    tokens: () => mockClientTokens(),
    user: jest.fn(() => ({ id: "admin" }))
  },
  UserType: { Employee: "employee" }
}));

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn()
}));

import { useAccountConfig } from "./useAccountConfig";

describe("useAccountConfig activation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientTokens.mockReturnValue(undefined as never);
    mockClientLogout.mockResolvedValue(true as never);
  });

  it("valide la clé du lien même pendant une session administrateur", async () => {
    mockAccountsMe.mockRejectedValue(new Error("invalid_api_key") as never);

    const { onQrLogin } = useAccountConfig({ refresh: false });
    expect(onQrLogin).toBeDefined();
    const result = await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/not-a-valid-activation-code"
    );

    expect(mockAccountsMe).toHaveBeenCalledWith({
      apiKey: "not-a-valid-activation-code"
    });
    expect(result).toBe(false);
    expect(mockSetAccountConfig).not.toHaveBeenCalled();
    expect(mockSetUserType).not.toHaveBeenCalled();
    expect(mockStorageSetItem).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith("invalidActivationCode", {
      type: "error"
    });
  });

  it("n'applique les paramètres locaux qu'après validation", async () => {
    mockAccountsMe.mockRejectedValue(new Error("invalid_api_key") as never);

    const { onQrLogin } = useAccountConfig({ refresh: false });
    await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/invalid?deviceName=Caisse&hmac=secret&isGuest=true"
    );

    expect(mockStorageSetItem).not.toHaveBeenCalled();
  });

  it("refuse un segment d'activation vide sans utiliser le JWT", async () => {
    const { onQrLogin } = useAccountConfig({ refresh: false });
    const result = await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/"
    );

    expect(result).toBe(false);
    expect(mockAccountsMe).not.toHaveBeenCalled();
    expect(mockSetAccountConfig).not.toHaveBeenCalled();
    expect(mockSetUserType).not.toHaveBeenCalled();
  });

  it("conserve l'activation d'une clé valide", async () => {
    const account = {
      invoice_key: "valid-key",
      is_atm: false,
      is_checkout_secure: false
    };
    mockAccountsMe.mockResolvedValue(account as never);

    const { onQrLogin } = useAccountConfig({ refresh: false });
    const result = await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/valid-key?deviceName=Caisse&hmac=secret&isGuest=true"
    );

    expect(result).toBe(true);
    expect(mockSetAccountConfig).toHaveBeenCalledWith(account);
    expect(mockSetUserType).toHaveBeenCalledWith("employee");
    expect(mockStorageSetItem).toHaveBeenNthCalledWith(
      1,
      "accountConfig",
      JSON.stringify(account)
    );
    expect(mockStorageSetItem).toHaveBeenNthCalledWith(
      2,
      "deviceName",
      "Caisse"
    );
    expect(mockStorageSetItem).toHaveBeenNthCalledWith(3, "hmac", "secret");
    expect(mockStorageSetItem).toHaveBeenNthCalledWith(4, "isGuest", "true");
    expect(mockToastShow).toHaveBeenCalledWith("setupComplete", {
      type: "success"
    });
  });

  it("supprime le JWT après une activation Employé valide", async () => {
    mockClientTokens.mockReturnValue({ auth_token: "jwt" } as never);
    mockAccountsMe.mockResolvedValue({
      invoice_key: "employee-key",
      is_atm: false,
      is_checkout_secure: false
    } as never);

    const { onQrLogin } = useAccountConfig({ refresh: false });
    const result = await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/employee-key"
    );

    expect(result).toBe(true);
    expect(mockAccountsMe).toHaveBeenCalledWith({ apiKey: "employee-key" });
    expect(mockClientLogout).toHaveBeenCalledTimes(1);
    expect(mockClientLogout.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetUserType.mock.invocationCallOrder[0]
    );
    expect(mockSetUserType).toHaveBeenCalledWith("employee");
  });

  it("décode les paramètres d'un lien d'activation", async () => {
    mockAccountsMe.mockResolvedValue({
      invoice_key: "valid-key",
      is_atm: false,
      is_checkout_secure: false
    } as never);

    const { onQrLogin } = useAccountConfig({ refresh: false });
    const result = await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/valid-key?hmac=abc%3Ddef%26ghi%2Bplus&isGuest=true&deviceName=Codex%20Employe+POS"
    );

    expect(result).toBe(true);
    expect(mockAccountsMe).toHaveBeenCalledWith({ apiKey: "valid-key" });
    expect(mockStorageSetItem).toHaveBeenCalledWith(
      "deviceName",
      "Codex Employe POS"
    );
    expect(mockStorageSetItem).toHaveBeenCalledWith(
      "hmac",
      "abc=def&ghi+plus"
    );
    expect(mockStorageSetItem).toHaveBeenCalledWith("isGuest", "true");
  });

  it("conserve la priorité du HMAC renvoyé par le serveur", async () => {
    mockAccountsMe.mockResolvedValue({
      hmac_secret: "server-secret",
      invoice_key: "valid-key",
      is_atm: false,
      is_checkout_secure: true
    } as never);

    const { onQrLogin } = useAccountConfig({ refresh: false });
    const result = await onQrLogin?.(
      "https://checkout.swiss-bitcoin-pay.ch/connect/valid-key?hmac=link-secret"
    );

    expect(result).toBe(true);
    expect(mockStorageSetItem).toHaveBeenCalledWith("hmac", "server-secret");
    expect(mockStorageSetItem).not.toHaveBeenCalledWith("hmac", "link-secret");
  });

  it("rafraîchit la configuration stockée avec le JWT quand il existe", async () => {
    const jwtAccount = {
      invoice_key: "stored-invoice-key",
      mail: "admin@example.com",
      wallet_id: "wallet-id",
      deposit_address: "xpub-admin"
    };
    mockStorageGetItem.mockResolvedValue(
      JSON.stringify(jwtAccount) as never
    );
    mockClientTokens.mockReturnValue({ auth_token: "jwt" } as never);
    mockAccountsMe.mockResolvedValue(jwtAccount as never);

    useAccountConfig();
    const loadEffect = mockUseEffect.mock.calls[
      mockUseEffect.mock.calls.length - 1
    ]?.[0] as () => void;
    loadEffect();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockAccountsMe).toHaveBeenCalledWith(undefined);
    expect(mockStorageSetItem).toHaveBeenCalledWith(
      "accountConfig",
      JSON.stringify(jwtAccount)
    );
    expect(mockSetAccountConfig).toHaveBeenLastCalledWith(jwtAccount);
  });

  it("rafraîchit une session employé avec sa clé d'encaissement", async () => {
    mockStorageGetItem.mockResolvedValue(
      JSON.stringify({ invoice_key: "stored-invoice-key" }) as never
    );
    mockClientTokens.mockReturnValue(undefined as never);
    mockAccountsMe.mockResolvedValue({
      invoice_key: "stored-invoice-key"
    } as never);

    useAccountConfig();
    const loadEffect = mockUseEffect.mock.calls[
      mockUseEffect.mock.calls.length - 1
    ]?.[0] as () => void;
    loadEffect();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockAccountsMe).toHaveBeenCalledWith({
      apiKey: "stored-invoice-key"
    });
  });
});
