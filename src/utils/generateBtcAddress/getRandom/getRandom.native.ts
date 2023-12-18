import { generateSecureRandom } from "react-native-securerandom";

export const getRandom = async (count: number) =>
  Buffer.from(await generateSecureRandom(count));
