import { AccountConfigType, UserType } from "@types";
import { AsyncStorage } from "@utils";
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useState
} from "react";
import { keyStoreUserType } from "./settingsKeys";
import { useIsCameraAvailable } from "@hooks/useIsCameraAvailable";

type SBPContextType = {
  clearContext: () => void;
  isCameraAvailable: boolean;
  userType?: UserType;
  setUserType: (value: UserType) => void;
  preferredCurrency?: string;
  setPreferredCurrency: (value: string) => void;
  accountConfig?: AccountConfigType;
  setAccountConfig: (partialAccountConfig: Partial<AccountConfigType>) => void;

  headerHeight: number;
  setHeaderHeight: (value: number) => void;
};

// @ts-ignore
export const SBPContext = createContext<SBPContextType>({});

export const SBPContextProvider = ({ children }: PropsWithChildren) => {
  const [userType, setUserType] = useState<UserType>();
  const [preferredCurrency, setPreferredCurrency] = useState<string>();
  const [accountConfig, setAccountConfig] = useState<AccountConfigType>();
  const [headerHeight, setHeaderHeight] = useState(0);
  const isCameraAvailable = useIsCameraAvailable();

  const clearContext = useCallback(() => {
    setUserType(undefined);
    setAccountConfig(undefined);
  }, []);

  const _setUserType = useCallback((value: UserType) => {
    setUserType(value);
    AsyncStorage.setItem(keyStoreUserType, value);
  }, []);

  useEffect(() => {
    (async () => {
      setUserType(
        ((await AsyncStorage.getItem(keyStoreUserType)) as UserType) ||
          UserType.Employee
      );
    })();
  }, []);

  const setPartialAccountConfig = useCallback<
    SBPContextType["setAccountConfig"]
  >(
    (partialAccountConfig) => {
      setAccountConfig({
        ...(accountConfig || {}),
        ...partialAccountConfig
      } as AccountConfigType);
    },
    [accountConfig]
  );

  return (
    <SBPContext.Provider
      value={{
        clearContext,
        isCameraAvailable,
        userType,
        setUserType: _setUserType,
        preferredCurrency,
        setPreferredCurrency,
        accountConfig,
        setAccountConfig: setPartialAccountConfig,
        headerHeight,
        setHeaderHeight
      }}
    >
      {children}
    </SBPContext.Provider>
  );
};
