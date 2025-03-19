import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRootDomain, apiRootUrl } from "@config";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import {
  TextField,
  Loader,
  Text,
  PageContainer,
  FieldContainer
} from "@components";
import {
  faAt,
  faBuilding,
  faClock,
  faDollarSign,
  faPen,
  faSuitcase,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate, useParams } from "@components/Router";
import { validate as isEmail } from "email-validator";
import { getFormattedUnit } from "@utils";
import { useToast } from "react-native-toast-notifications";
import {
  FieldsType,
  SourceOfFunds,
  SourceOfFundsDetails,
  SourceOfFundsDocuments
} from "@types";
import * as S from "./styled";
import { InvoiceType } from "@screens/Invoice/Invoice";
import axios from "axios";
import { useTheme } from "styled-components";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { PayerKyc } from "./components/PayerKyc";
import { AmlDocumentation } from "./components/AmlDocumentation";
import { AmlStatus } from "./components/AmlStatus";
import { AmlInfoStatus } from "./components/AmlStatus/AmlStatus";

export const sourceOfFundsRequirements = {
  [SourceOfFunds.Income]: {
    documents: [
      [SourceOfFundsDocuments.Payslip],
      [SourceOfFundsDocuments.EmployerLetter],
      [SourceOfFundsDocuments.IncomeBankStatement]
    ],
    details: [
      { id: SourceOfFundsDetails.SalaryPerAnnum, type: FieldsType.Text },
      { id: SourceOfFundsDetails.EmployerName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.EmployerAddress, type: FieldsType.Multiline },
      { id: SourceOfFundsDetails.EmployerNature, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.InvestmentSale]: {
    documents: [
      [SourceOfFundsDocuments.InvestmentSaleCertificate],
      [SourceOfFundsDocuments.FundsBankStatement],
      [SourceOfFundsDocuments.SignedLetter]
    ],
    details: [
      {
        id: SourceOfFundsDetails.SharesDescription,
        type: FieldsType.Multiline
      },
      { id: SourceOfFundsDetails.SellerName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.HowLongHeld, type: FieldsType.Text },
      { id: SourceOfFundsDetails.SaleAmount, type: FieldsType.Text },
      { id: SourceOfFundsDetails.DateFundsReceived, type: FieldsType.Date }
    ]
  },
  [SourceOfFunds.PropertySale]: {
    documents: [
      [SourceOfFundsDocuments.SolicitorLetter],
      [SourceOfFundsDocuments.PropertySaleContract]
    ],
    details: [
      {
        id: SourceOfFundsDetails.SoldPropertyAddress,
        type: FieldsType.Multiline
      },
      { id: SourceOfFundsDetails.PropertyDateOfSale, type: FieldsType.Text },
      {
        id: SourceOfFundsDetails.PropertyTotalSaleAmount,
        type: FieldsType.Text
      }
    ]
  },
  [SourceOfFunds.CompanySale]: {
    documents: [
      [SourceOfFundsDocuments.CompanySaleLetter],
      [
        SourceOfFundsDocuments.CompanySaleContract,
        SourceOfFundsDocuments.CompanySaleBankStatement,
        SourceOfFundsDocuments.CompanySaleMediaCoverage
      ]
    ],
    details: [
      { id: SourceOfFundsDetails.CompanyName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.CompanyNature, type: FieldsType.Text },
      { id: SourceOfFundsDetails.CompanyDateOfSale, type: FieldsType.Date },
      {
        id: SourceOfFundsDetails.CompanyTotalSaleAmount,
        type: FieldsType.Text
      },
      { id: SourceOfFundsDetails.CompanyShares, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.Inheritance]: {
    documents: [
      [SourceOfFundsDocuments.ProbateGrant],
      [SourceOfFundsDocuments.WillLetter]
    ],
    details: [
      { id: SourceOfFundsDetails.DeceasedName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.DeathDate, type: FieldsType.Date },
      {
        id: SourceOfFundsDetails.InheritanceRelationship,
        type: FieldsType.Text
      },
      { id: SourceOfFundsDetails.DateReceived, type: FieldsType.Date },
      { id: SourceOfFundsDetails.InheritanceAmount, type: FieldsType.Text },
      {
        id: SourceOfFundsDetails.InheritanceSolicitorDetails,
        type: FieldsType.Multiline
      }
    ]
  },
  [SourceOfFunds.DivorceSettlement]: {
    documents: [
      [SourceOfFundsDocuments.CourtOrderCopy],
      [SourceOfFundsDocuments.DivorceSettlementLetter]
    ],
    details: [
      { id: SourceOfFundsDetails.DivorceDateReceived, type: FieldsType.Date },
      { id: SourceOfFundsDetails.DivorceAmountReceived, type: FieldsType.Text },
      { id: SourceOfFundsDetails.DivorcedPartnerName, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.CompanyProfits]: {
    documents: [
      [SourceOfFundsDocuments.CompanyAccountsAudit],
      [SourceOfFundsDocuments.CompanyActivityLetter]
    ],
    details: [
      { id: SourceOfFundsDetails.CompanyProfitsName, type: FieldsType.Text },
      {
        id: SourceOfFundsDetails.CompanyProfitsAddress,
        type: FieldsType.Multiline
      },
      { id: SourceOfFundsDetails.CompanyProfitsNature, type: FieldsType.Text },
      {
        id: SourceOfFundsDetails.CompanyAnnualProfitAmount,
        type: FieldsType.Text
      }
    ]
  },
  [SourceOfFunds.RetirementIncome]: {
    documents: [
      [SourceOfFundsDocuments.PensionStatement],
      [SourceOfFundsDocuments.RetirementAccountantLetter],
      [SourceOfFundsDocuments.RetirementBankStatementReceipt],
      [SourceOfFundsDocuments.SavingsAccountStatement]
    ],
    details: [
      { id: SourceOfFundsDetails.RetirementDate, type: FieldsType.Date },
      {
        id: SourceOfFundsDetails.PreviousOccupationDetails,
        type: FieldsType.Multiline
      },
      { id: SourceOfFundsDetails.PreviousEmployerName, type: FieldsType.Text },
      {
        id: SourceOfFundsDetails.PreviousEmployerAddress,
        type: FieldsType.Multiline
      },
      {
        id: SourceOfFundsDetails.PensionIncomeDetails,
        type: FieldsType.Multiline
      }
    ]
  },
  [SourceOfFunds.FixedDeposits]: {
    documents: [
      [SourceOfFundsDocuments.SavingsStatement],
      [SourceOfFundsDocuments.AccountStartEvidence]
    ],
    details: [
      {
        id: SourceOfFundsDetails.DepositsInstitutionName,
        type: FieldsType.Text
      },
      {
        id: SourceOfFundsDetails.AccountEstablishmentDate,
        type: FieldsType.Date
      },
      {
        id: SourceOfFundsDetails.SavingsAcquirementDetails,
        type: FieldsType.Multiline
      }
    ]
  },
  [SourceOfFunds.DividendPayments]: {
    documents: [
      [SourceOfFundsDocuments.DividendContract],
      [SourceOfFundsDocuments.DividendBankStatement],
      [SourceOfFundsDocuments.DividendDetailsLetter],
      [SourceOfFundsDocuments.CompanyAccountsSet]
    ],
    details: [
      { id: SourceOfFundsDetails.DividendReceiptDate, type: FieldsType.Date },
      {
        id: SourceOfFundsDetails.DividendAmountReceived,
        type: FieldsType.Text
      },
      { id: SourceOfFundsDetails.DividendCompanyName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.DividendLength, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.Gift]: {
    documents: [
      [SourceOfFundsDocuments.DonorLetter],
      [SourceOfFundsDocuments.DonorSourceOfWealth]
    ],
    details: [
      { id: SourceOfFundsDetails.GiftDate, type: FieldsType.Date },
      { id: SourceOfFundsDetails.GiftAmount, type: FieldsType.Text },
      { id: SourceOfFundsDetails.GiftPerson, type: FieldsType.Email },
      {
        id: SourceOfFundsDetails.GiftPersonRelationship,
        type: FieldsType.Text
      },
      { id: SourceOfFundsDetails.GiftReason, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.Loan]: {
    documents: [
      [SourceOfFundsDocuments.LoanAgreement],
      [SourceOfFundsDocuments.LoanStatements]
    ],
    details: [
      { id: SourceOfFundsDetails.LoanProviderName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.LoanDate, type: FieldsType.Date },
      { id: SourceOfFundsDetails.LoanAmount, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.Lottery]: {
    documents: [
      [SourceOfFundsDocuments.LotteryCompanyEvidence],
      [SourceOfFundsDocuments.ChequeWinningsReceipt]
    ],
    details: [
      { id: SourceOfFundsDetails.SourceName, type: FieldsType.Text },
      { id: SourceOfFundsDetails.WindfallDetails, type: FieldsType.Text }
    ]
  },
  [SourceOfFunds.CompensationPayout]: {
    documents: [
      [SourceOfFundsDocuments.CompensatingBodyLetter],
      [SourceOfFundsDocuments.SolicitorLetter]
    ],
    details: [
      {
        id: SourceOfFundsDetails.CompensationPayoutDetails,
        type: FieldsType.Multiline
      }
    ]
  },
  [SourceOfFunds.LifeInsurance]: {
    documents: [
      [SourceOfFundsDocuments.PayoutStatement],
      [SourceOfFundsDocuments.InsuranceLetter]
    ],
    details: [
      {
        id: SourceOfFundsDetails.LifeInsuranceAmountReceived,
        type: FieldsType.Text
      },
      {
        id: SourceOfFundsDetails.LifeInsurancePolicyProvider,
        type: FieldsType.Text
      },
      { id: SourceOfFundsDetails.LifeInsuranceNumber, type: FieldsType.Text },
      {
        id: SourceOfFundsDetails.LifeInsurancePayoutDate,
        type: FieldsType.Date
      }
    ]
  }
} as const;

const getTrue = () => true;

export type AMLForm = {
  payerName: string;
  occupation: string;
  payerEmail: string;

  // Picker
  sourcesOfFunds: SourceOfFundsForm[];
};

type SourceOfFundsForm = {
  sourceOfFund: SourceOfFunds;
  details: {
    document: SourceOfFundsDetails;
    value: string;
  }[];
  documents: {
    document: SourceOfFundsDocuments;
    url: string;
  }[];
};

type AmlInfo = {
  invoiceId: string;
  status: AmlInfoStatus;
  kycId?: string;
  payerName?: string;
};

export const Aml = () => {
  const { t: tRoot } = useTranslation();
  const { colors } = useTheme();
  const navigate = useNavigate();
  const { t } = useTranslation(undefined, { keyPrefix: "screens.kyc" });
  const toast = useToast();
  const [invoiceData, setInvoiceData] = useState<InvoiceType>();
  const [isSubmitting, setIsSubmiting] = useState(false);
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;

  const [amlInfo, setAmlInfo] = useState<AmlInfo>();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid },
    watch
  } = useForm<AMLForm>({
    mode: "onTouched",
    defaultValues: {
      sourcesOfFunds: [{ sourceOfFund: "", details: [], documents: [] }]
    }
  });

  const refreshAmlInfo = useCallback(async () => {
    try {
      const { data } = await axios.get<AmlInfo>(`${apiRootUrl}/aml-info`, {
        params: { invoiceId }
      });

      if (data.status === "kycDone") {
        setValue("payerName", data.payerName);
      } else if (data.status === "accepted") {
        navigate(`/invoice/${invoiceId}`);
      }
      setAmlInfo(data);
      return data;
    } catch (e) {}
  }, [invoiceId, navigate, setValue]);

  const onSubmit = useCallback<SubmitHandler<AMLForm>>(
    async (values) => {
      const { payerName: _, payerEmail, ...otherValues } = values;
      setIsSubmiting(true);
      try {
        await axios.post(`${apiRootUrl}/aml-info`, {
          invoiceId,
          payerEmail,
          amlData: otherValues
        });
        refreshAmlInfo();
      } catch (e) {
        toast.show(tRoot("common.errors.unknown"), {
          type: "error"
        });
      }

      setIsSubmiting(false);
    },
    [invoiceId, refreshAmlInfo, tRoot, toast]
  );

  const onKycSuccess = useCallback(() => {
    const interval = setInterval(async () => {
      if ((await refreshAmlInfo())?.status !== "draft") {
        clearInterval(interval);
      }
    }, 1000);
  }, [refreshAmlInfo]);

  const { sendJsonMessage, lastJsonMessage, readyState } =
    useWebSocket<InvoiceType>(`wss://${apiRootDomain}/invoice`, {
      shouldReconnect: getTrue
    });

  useEffect(() => {
    void onKycSuccess();
  }, [refreshAmlInfo]);

  useEffect(() => {
    if (readyState === ReadyState.CONNECTING) {
      sendJsonMessage({ id: invoiceId });
    }
  }, [readyState]);

  useEffect(() => {
    if (lastJsonMessage) {
      setInvoiceData(lastJsonMessage);
    }
  }, [lastJsonMessage]);

  return (
    <PageContainer
      header={{ title: t("title") }}
      {...(amlInfo?.status === "kycDone"
        ? {
            footerButton: {
              title: tRoot("common.submit"),
              disabled: !isValid,
              onPress: handleSubmit(onSubmit),
              isLoading: isSubmitting
            }
          }
        : {})}
    >
      {!invoiceData || !invoiceId || !amlInfo ? (
        <Loader />
      ) : (
        <S.StyledComponentStack>
          <AmlStatus amlStatus={amlInfo.status} />
          <S.PartTitle>{t("relatedInvoice")}</S.PartTitle>
          <S.InvoicePreviewContainer>
            <S.DescriptionLine>
              <S.LabelContainer>
                <S.LabelIcon icon={faBuilding} />
                <S.Label>{t("invoiceSeller")}</S.Label>
              </S.LabelContainer>
              <S.Value>{invoiceData.merchantName}</S.Value>
            </S.DescriptionLine>
            <S.DescriptionLine>
              <S.LabelContainer>
                <S.LabelIcon icon={faPen} />
                <S.Label>{t("invoiceTitle")}</S.Label>
              </S.LabelContainer>
              <S.Value>{invoiceData.title}</S.Value>
            </S.DescriptionLine>
            <S.DescriptionLine>
              <S.LabelContainer>
                <S.LabelIcon icon={faDollarSign} />
                <S.Label>{t("invoiceFiatAmount")}</S.Label>
              </S.LabelContainer>
              <S.Value>
                {getFormattedUnit(
                  invoiceData.input.amount,
                  invoiceData.input.unit
                )}
              </S.Value>
            </S.DescriptionLine>
          </S.InvoicePreviewContainer>
          <></>
          <S.PartDescription color={colors.greyLight}>
            {t("description")}
          </S.PartDescription>
          <></>
          {amlInfo.status === "draft" ? (
            <PayerKyc
              kycId={amlInfo?.kycId}
              invoiceId={invoiceId}
              onSuccess={onKycSuccess}
            />
          ) : amlInfo.status === "kycDone" ? (
            <S.StyledComponentStack>
              <S.PartTitle>{t("questionnaire")}</S.PartTitle>
              <Controller
                control={control}
                name="payerName"
                rules={{ required: true, maxLength: 100 }}
                render={({ field, fieldState: { error } }) => (
                  <FieldContainer icon={faUser} title={t(field.name)}>
                    <TextField
                      label={t(field.name)}
                      isLabelAsPlaceholder
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={error?.message}
                      disabled={!!amlInfo?.payerName}
                    />
                  </FieldContainer>
                )}
              />
              <Controller
                control={control}
                name="payerOccupation"
                rules={{ required: true, maxLength: 200 }}
                render={({ field, fieldState: { error } }) => (
                  <FieldContainer icon={faSuitcase} title={t(field.name)}>
                    <TextField
                      label={t(field.name)}
                      isLabelAsPlaceholder
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={error?.message}
                    />
                  </FieldContainer>
                )}
              />
              <Controller
                control={control}
                name="payerEmail"
                rules={{ required: true, maxLength: 200, validate: isEmail }}
                render={({ field, fieldState: { error } }) => (
                  <FieldContainer icon={faAt} title={t(field.name)}>
                    <TextField
                      label={t(field.name)}
                      isLabelAsPlaceholder
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={error?.message}
                    />
                  </FieldContainer>
                )}
              />
              <AmlDocumentation
                invoiceId={invoiceId}
                control={control}
                watch={watch}
              />
            </S.StyledComponentStack>
          ) : amlInfo.status === "submitted" ? (
            <S.StyledComponentStack>
              <S.SubmittedIcon size={80} icon={faClock} />
              <>
                <S.SubmittedTitle>{t("pendingVerification")}</S.SubmittedTitle>
                <S.SubmittedDescription>
                  {t("pendingVerificationDescription")}
                </S.SubmittedDescription>
              </>
            </S.StyledComponentStack>
          ) : null}
        </S.StyledComponentStack>
      )}
    </PageContainer>
  );
};
