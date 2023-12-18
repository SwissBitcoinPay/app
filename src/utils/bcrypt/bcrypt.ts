import rootBcrypt from "bcryptjs";

export const bcrypt = {
  // eslint-disable-next-line @typescript-eslint/require-await
  getSalt: async (n: number) => {
    return rootBcrypt.genSaltSync(n);
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  hash: async (salt: string, pass: string) => {
    return rootBcrypt.hashSync(pass, salt);
  }
};
