import { useTranslation } from "react-i18next";
import { Control, useFieldArray, UseFormWatch } from "react-hook-form";
import { Text, Button } from "@components";
import { faFileCirclePlus } from "@fortawesome/free-solid-svg-icons";
import { AMLForm } from "@screens/Aml/Aml";
import { SourceOfFund } from "./components/SourceOfFund";
import * as S from "./styled";

type AmlDocumentationProps = {
  control: Control<AMLForm>;
  watch: UseFormWatch<AMLForm>;
  invoiceId: string;
};

export const AmlDocumentation = ({
  control,
  watch,
  invoiceId
}: AmlDocumentationProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: "screens.kyc" });
  const {
    fields: sourceOfFundsFields,
    append,
    remove
  } = useFieldArray({
    control,
    name: "sourcesOfFunds"
  });

  return (
    <S.SourceOfFundsContainer>
      {sourceOfFundsFields.map((_, index) => {
        const sourceOfFund = watch(`sourcesOfFunds.${index}`);
        const isSingleItem = sourceOfFundsFields.length === 1;

        return (
          <SourceOfFund
            key={index}
            control={control}
            index={index}
            sourceOfFund={sourceOfFund}
            invoiceId={invoiceId}
            remove={!isSingleItem ? () => remove(index) : undefined}
          />
        );
      })}
      <Button
        title={t("addSourceOfFund")}
        icon={faFileCirclePlus}
        onPress={() => append({})}
        size="small"
      />
    </S.SourceOfFundsContainer>
  );
};
