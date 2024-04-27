import { useTranslation } from "react-i18next";

const SHORT_COMMIT_LENGTH = 7;

const COMMIT = process.env.CM_COMMIT || process.env.COMMIT_REF;

export const useVersionTag = () => {
  const { t } = useTranslation(undefined, { keyPrefix: "common" });

  return `${t("version", {
    tag: `${process.env.APP_VERSION}`
  })} - ${
    COMMIT ? `Commit ${COMMIT.slice(0, SHORT_COMMIT_LENGTH)}` : "Dev mode"
  }`;
};
