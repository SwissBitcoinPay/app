import { UserType } from "@types";

type IsMinUserTypeParams = {
  userType?: UserType;
  minUserType: UserType;
};

export const isMinUserType = ({
  userType,
  minUserType
}: IsMinUserTypeParams) => {
  if (minUserType === UserType.Employee) {
    return (
      userType === UserType.Employee ||
      userType === UserType.Admin ||
      userType === UserType.Wallet
    );
  } else if (minUserType === UserType.Admin) {
    return userType === UserType.Admin || userType === UserType.Wallet;
  } else if (minUserType === UserType.Wallet) {
    return userType === UserType.Wallet;
  }
  return false;
};
