import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "styled-components";
import {
  Button,
  ComponentStack,
  LoginView,
  SplashScreen,
  Text,
  TextField
} from "@components";
import { keyStoreMnemonicWords } from "@config/settingsKeys";
import { AsyncStorage } from "@utils/AsyncStorage";
import { revealWalletWords } from "@utils/sattleme/walletWords";
import * as S from "./styled";

type WalletWordsNoticeProps = {
  // Part sur sattle.me ; les mots restent dans ce navigateur, l'écran revient
  // à chaque ouverture de l'app web v2.
  onContinue: () => void;
  isLeaving: boolean;
};

const readWords = (password: string) =>
  AsyncStorage.getItem(keyStoreMnemonicWords, undefined, password);

// Avant de partir sur sattle.me (décision du propriétaire du 05.11.2026) : le
// portefeuille créé dans l'app web v2 n'a ses 12 mots que dans ce navigateur.
// Ils s'affichent après le mot de passe qui les protège, pour que son
// propriétaire les note ; sattle.me les lui demande ensuite pour transférer ce
// que ce portefeuille contient (« Taper mes 12 mots »). Rien n'est envoyé.
export const WalletWordsNotice = ({
  onContinue,
  isLeaving
}: WalletWordsNoticeProps) => {
  const { colors } = useTheme();
  const { t } = useTranslation(undefined, { keyPrefix: "sattlemeMigration" });
  const [password, setPassword] = useState("");
  const [words, setWords] = useState<string[]>();
  const [failure, setFailure] = useState<"wrongPassword" | "unreadable">();
  const [isReading, setIsReading] = useState(false);

  // L'écran de démarrage couvre la page jusqu'à ce que l'app v2 s'affiche,
  // ce qui n'arrive pas ici.
  useEffect(() => {
    void SplashScreen.hide({ fade: true });
  }, []);

  const reveal = useCallback(async () => {
    if (!password || isReading) return;
    setIsReading(true);
    const result = await revealWalletWords(readWords, password);
    setIsReading(false);
    if (result.status === "words") {
      // Le mot de passe ne sert plus.
      setPassword("");
      setFailure(undefined);
      setWords(result.words);
    } else {
      setFailure(result.status);
    }
  }, [password, isReading]);

  return (
    <S.Page contentContainerStyle={S.pageContent}>
      <S.PageContent>
        <LoginView
          title={t("title")}
          button={{
            type: "bitcoin",
            title: words ? t("continueAfterWords") : t("showWords"),
            onPress: words
              ? onContinue
              : () => {
                  void reveal();
                },
            disabled: !words && !password,
            isLoading: isReading || isLeaving,
            isWhiteBackground: true
          }}
        >
          <Text h5 weight={600} color={colors.primary}>
            {t("walletInBrowser")}
          </Text>
          {words ? (
            <ComponentStack gapSize={12}>
              <Text h5 weight={700} color={colors.primary}>
                {`⚠️ ${t("writeDown")}`}
              </Text>
              <S.WordsGrid testID="sattleme-words">
                {words.map((word, index) => (
                  <S.WordCell key={index}>
                    <Text h5 weight={600} color={colors.grey}>
                      {index + 1}.
                    </Text>
                    <Text h4 weight={700} color={colors.primary} selectable>
                      {word}
                    </Text>
                  </S.WordCell>
                ))}
              </S.WordsGrid>
            </ComponentStack>
          ) : (
            <ComponentStack gapSize={12}>
              <TextField
                label={t("password")}
                value={password}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={(value: string) => {
                  setPassword(value);
                  setFailure(undefined);
                }}
                onSubmitEditing={() => {
                  void reveal();
                }}
                error={failure ? t(failure) : undefined}
              />
              <Text h6 weight={600} color={colors.grey}>
                {t("passwordHint")}
              </Text>
              <Button
                title={t("alreadyWritten")}
                type="primary"
                size="small"
                mode="outline"
                onPress={onContinue}
                disabled={isLeaving}
              />
            </ComponentStack>
          )}
        </LoginView>
      </S.PageContent>
    </S.Page>
  );
};
