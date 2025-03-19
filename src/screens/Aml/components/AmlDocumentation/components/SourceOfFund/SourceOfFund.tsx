import { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Control, Controller, FieldArrayWithId } from "react-hook-form";
import { Text, FieldContainer, SelectField } from "@components";
import {
  faCircleInfo,
  faCoins,
  faFileLines,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FieldByType, FieldsType, SourceOfFundsDocuments } from "@types";
import { ReadyState } from "react-use-websocket";
import { AMLForm, sourceOfFundsRequirements } from "@screens/Aml/Aml";
import { DocumentField } from "./components/DocumentField";
import * as S from "./styled";

type SourceOfFundProps = {
  invoiceId: string;
  control: Control<AMLForm>;
  index: number;
  sourceOfFund: FieldArrayWithId<AMLForm, "sourcesOfFunds", "id">;
  remove?: () => void;
};

export const SourceOfFund = ({
  invoiceId,
  control,
  index,
  sourceOfFund,
  remove
}: SourceOfFundProps) => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, { keyPrefix: "screens.kyc" });

  return (
    <S.SourceOfFundContainer gapSize={48}>
      <>
        {remove && (
          <S.SourceOfFundDeleteButton
            size="small"
            type="error"
            icon={faTrash}
            title={tRoot("common.delete")}
            onPress={remove}
          />
        )}
        <S.SourceOfFundPart>
          <S.PartTitle>
            {t("sourceOfFund")}
            {remove ? ` ${index + 1}` : ""}
          </S.PartTitle>
          <FieldContainer icon={faCoins} title={t("sourceOfFund")}>
            <Controller
              control={control}
              name={`sourcesOfFunds.${index}.sourceOfFund`}
              rules={{ required: true }}
              render={({ fieldState: { error }, field }) => (
                <SelectField
                  isLabelAsPlaceholder
                  items={Object.keys(sourceOfFundsRequirements).map((key) => ({
                    label: t(`sourceOfFundData.${key}`),
                    value: key
                  }))}
                  value={field.value}
                  onValueChange={(v) => {
                    return field.onChange(v);
                  }}
                  onBlur={field.onBlur}
                  error={error?.message}
                />
              )}
            />
          </FieldContainer>
        </S.SourceOfFundPart>
      </>
      {sourceOfFund.sourceOfFund && (
        <S.SourceOfFundPart>
          <S.PartTitle>{t("details")}</S.PartTitle>
          {sourceOfFundsRequirements[sourceOfFund.sourceOfFund].details.map(
            (d) => {
              const { id: detailId, type: fieldType } = d;

              const Component = FieldByType[fieldType];
              return (
                <Controller
                  key={detailId}
                  control={control}
                  name={`sourcesOfFunds.${index}.details.${detailId}`}
                  rules={{ required: true }}
                  render={({ field, fieldState: { error } }) => (
                    <FieldContainer
                      icon={faCircleInfo}
                      title={t(`detailsData.${detailId}`)}
                      multiline={fieldType === FieldsType.Multiline}
                    >
                      <Component
                        isLabelAsPlaceholder
                        value={field.value}
                        onChange={(e: ChangeEvent) => {
                          field.onChange(e.nativeEvent.value);
                        }}
                        onBlur={field.onBlur}
                        autoCorrect={false}
                        error={error?.message}
                      />
                    </FieldContainer>
                  )}
                />
              );
            }
          )}
        </S.SourceOfFundPart>
      )}
      {sourceOfFund.sourceOfFund && (
        <S.SourceOfFundPart>
          <S.PartTitle>{t("documents")}</S.PartTitle>
          <FieldContainer
            icon={faFileLines}
            title={t("documentType")}
            multiline
          >
            <Controller
              control={control}
              name={`sourcesOfFunds.${index}.documents`}
              rules={{ required: true }}
              render={({ fieldState: { error }, field }) => (
                <SelectField
                  // label={t("sourceOfFund")}
                  isLabelAsPlaceholder
                  items={sourceOfFundsRequirements[
                    sourceOfFund.sourceOfFund
                  ].documents.map((d) => ({
                    label: d
                      .map((doc) => t(`documentsData.${doc}`))
                      .join(" + "),
                    value: d.join("|")
                  }))}
                  value={field.value?.map((v) => v.document).join("|")}
                  onValueChange={(v: string) => {
                    field.onChange(
                      v?.split("|").map((val) => ({
                        document: val as SourceOfFundsDocuments
                      })) || []
                    );
                  }}
                  onBlur={field.onBlur}
                  error={error?.message}
                />
              )}
            />
          </FieldContainer>
          {sourceOfFund.documents?.map((document) => {
            return (
              <Controller
                key={document.document}
                control={control}
                name={`sourcesOfFunds.${index}.documents.${document.document}`}
                rules={{ required: true }}
                render={({ field, fieldState: { error } }) => (
                  <FieldContainer
                    icon={faFileLines}
                    title={t(`documentsData.${document.document}`)}
                  >
                    <DocumentField
                      invoiceId={invoiceId}
                      field={field}
                      error={error}
                      onUploaded={(url) => {
                        field.onChange({ ...document, url });
                      }}
                    />
                  </FieldContainer>
                )}
              />
            );
          })}
        </S.SourceOfFundPart>
      )}
    </S.SourceOfFundContainer>
  );
};
