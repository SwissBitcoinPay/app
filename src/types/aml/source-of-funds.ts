export enum SourceOfFunds {
  Income = "income",
  InvestmentSale = "investmentSale",
  PropertySale = "propertySale",
  CompanySale = "companySale",
  Inheritance = "inheritance",
  DivorceSettlement = "divorceSettlement",
  CompanyProfits = "companyProfits",
  RetirementIncome = "retirementIncome",
  FixedDeposits = "fixedDeposits",
  DividendPayments = "dividendPayments",
  Gift = "gift",
  Loan = "loan",
  Lottery = "lottery",
  CompensationPayout = "compensationPayout",
  LifeInsurance = "lifeInsurance"
}

export enum SourceOfFundsDocuments {
  // Income
  Payslip = "payslip",
  EmployerLetter = "employerLetter",
  IncomeBankStatement = "incomeBankStatement",

  // InvestmentSale
  InvestmentSaleCertificate = "investmentSaleCertificate",
  FundsBankStatement = "fundsBankStatement",
  SignedLetter = "signedLetter",

  // PropertySale
  PropertySaleSolicitorLetter = "propertySaleSolicitorLetter",
  PropertySaleContract = "propertySaleContract",

  // CompanySale
  CompanySaleLetter = "companySaleLetter",
  CompanySaleContract = "companySaleContract",
  CompanySaleBankStatement = "companySaleBankStatement",
  CompanySaleMediaCoverage = "companySaleMediaCoverage",

  // Inheritance
  ProbateGrant = "probateGrant",
  WillLetter = "willLetter",

  // DivorceSettlement
  CourtOrderCopy = "courtOrderCopy",
  DivorceSettlementLetter = "divorceSettlementLetter",

  // CompanyProfits
  CompanyAccountsAudit = "companyAccountsAudit",
  CompanyActivityLetter = "companyActivityLetter",

  // RetirementIncome
  PensionStatement = "pensionStatement",
  RetirementAccountantLetter = "retirementAccountantLetter",
  RetirementBankStatementReceipt = "retirementBankStatementReceipt",
  SavingsAccountStatement = "savingsAccountStatement",

  // FixedDeposits
  SavingsStatement = "savingsStatement",
  AccountStartEvidence = "accountStartEvidence",

  // DividendPayments
  DividendContract = "dividendContract",
  DividendBankStatement = "dividendBankStatement",
  DividendDetailsLetter = "dividendDetailsLetter",
  CompanyAccountsSet = "companyAccountsSet",

  // Gift
  DonorLetter = "donorLetter",
  DonorSourceOfWealth = "donorSourceOfWealth",

  // Loan
  LoanAgreement = "loanAgreement",
  LoanStatements = "loanStatements",

  // Lottery
  LotteryCompanyEvidence = "lotteryCompanyEvidence",
  ChequeWinningsReceipt = "chequeWinningsReceipt",

  // CompensationPayout
  CompensatingBodyLetter = "compensatingBodyLetter",
  SolicitorLetter = "solicitorLetter",

  // LifeInsurance
  PayoutStatement = "payoutStatement",
  InsuranceLetter = "insuranceLetter"
}

export enum SourceOfFundsDetails {
  // Income
  SalaryPerAnnum = "salaryPerAnnum",
  EmployerName = "employerName",
  EmployerAddress = "employerAddress",
  EmployerNature = "employerNature",

  // InvestmentSale
  SharesDescription = "sharesDescription",
  SellerName = "sellerName",
  HowLongHeld = "howLongHeld",
  SaleAmount = "saleAmount",
  DateFundsReceived = "dateFundsReceived",

  // PropertySale
  SoldPropertyAddress = "soldPropertyAddress",
  PropertyDateOfSale = "propertyDateOfSale",
  PropertyTotalSaleAmount = "propertyTotalSaleAmount",

  // CompanySale
  CompanyName = "companyName",
  CompanyNature = "companyNature",
  CompanyDateOfSale = "companyDateOfSale",
  CompanyTotalSaleAmount = "companyTotalSaleAmount",
  CompanyShares = "companyShares",

  // Inheritance
  DeceasedName = "deceasedName",
  DeathDate = "deathDate",
  InheritanceRelationship = "inheritanceRelationship",
  DateReceived = "dateReceived",
  InheritanceAmount = "inheritanceAmount",
  InheritanceSolicitorDetails = "inheritanceSolicitorDetails",

  // DivorceSettlement
  DivorceDateReceived = "divorceDateReceived",
  DivorceAmountReceived = "divorceAmountReceived",
  DivorcedPartnerName = "divorcedPartnerName",

  // CompanyProfits
  CompanyProfitsName = "companyProfitsName",
  CompanyProfitsAddress = "companyProfitsAddress",
  CompanyProfitsNature = "companyProfitsNature",
  CompanyAnnualProfitAmount = "companyAnnualProfitAmount",

  // RetirementIncome
  RetirementDate = "retirementDate",
  PreviousOccupationDetails = "previousOccupationDetails",
  PreviousEmployerName = "previousEmployerName",
  PreviousEmployerAddress = "previousEmployerAddress",
  PensionIncomeDetails = "pensionIncomeDetails",

  // FixedDeposits
  DepositsInstitutionName = "depositsInstitutionName",
  AccountEstablishmentDate = "accountEstablishmentDate",
  SavingsAcquirementDetails = "savingsAcquirementDetails",

  // DividendPayments
  DividendReceiptDate = "dividendReceiptDate",
  DividendAmountReceived = "dividendAmountReceived",
  DividendCompanyName = "dividendCompanyName",
  DividendLength = "dividendLength",

  // Gift
  GiftDate = "giftDate",
  GiftAmount = "giftAmount",
  GiftPerson = "giftPerson",
  GiftReason = "giftReason",
  GiftPersonRelationship = "giftPersonRelationship",

  // Loan
  LoanProviderName = "loanProviderName",
  LoanDate = "loanDate",
  LoanAmount = "loanAmount",

  // Lottery
  SourceName = "sourceName",
  WindfallDetails = "windfallDetails",

  // CompensationPayout
  CompensationPayoutDetails = "compensationPayoutDetails",

  // LifeInsurance
  LifeInsuranceAmountReceived = "lifeInsuranceAmountReceived",
  LifeInsurancePolicyProvider = "lifeInsurancePolicyProvider",
  LifeInsuranceNumber = "lifeInsuranceNumber",
  LifeInsurancePayoutDate = "lifeInsurancePayoutDate"
}

export type FullDocumentation = {
  [k in SourceOfFunds]: {
    documents: SourceOfFundsDocuments[][];
    details: SourceOfFundsDetails[];
  };
};
