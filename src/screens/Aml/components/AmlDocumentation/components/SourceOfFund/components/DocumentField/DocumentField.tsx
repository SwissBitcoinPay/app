import { useMemo, useState } from "react";
import { apiRootUrl } from "@config";
import { ControllerRenderProps, FieldError } from "react-hook-form";
import { Text, FileField } from "@components";
import {
  SourceOfFunds,
  SourceOfFundsDetails,
  SourceOfFundsDocuments
} from "@types";
import * as S from "./styled";
import axios from "axios";

type SourceOfFundForm = {
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

type SourceOfFundProps = {
  invoiceId: string;
  field: ControllerRenderProps<SourceOfFundForm>;
  error?: FieldError;
  onUploaded: (url: string) => void;
};

export const DocumentField = ({
  invoiceId,
  field,
  error,
  onUploaded
}: SourceOfFundProps) => {
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [fileName, setFileName] = useState<string>();

  const document = useMemo(() => {
    const fullName = field.name.split(".");
    return fullName[fullName.length - 1];
  }, [field.name]);

  return (
    <FileField
      isLabelAsPlaceholder
      value={uploadProgress && !isSuccess ? `${uploadProgress}%` : fileName}
      isLoading={isUploading}
      backgroundComponent={
        uploadProgress && (
          <S.BackgroundLoading width={uploadProgress} isSuccess={isSuccess} />
        )
      }
      onChange={async (e) => {
        const files = e.target.files;
        if (files === null) {
          field.onChange(null);
          setFileName(null);
          setIsSuccess(false);
          setUploadProgress(undefined);
          return;
        }
        if (files?.length !== 1) return;

        setIsUploading(true);

        const data = new FormData();
        data.append("file", files[0]);

        const {
          data: { url }
        } = await axios.post<{ url: string }>(
          `${apiRootUrl}/kyc-doc-upload`,
          data,
          {
            params: {
              documentType: document,
              invoiceId
            },
            headers: {
              "Content-Type": "multipart/form-data"
            },
            onUploadProgress: (event) => {
              if (event.lengthComputable) {
                setUploadProgress(
                  Math.round((event.loaded / event.total) * 100)
                );
              }
            }
          }
        );

        if (url) {
          setIsSuccess(true);
          onUploaded(url);
          setFileName(files[0].name);
        }
        setIsUploading(false);
      }}
      onBlur={field.onBlur}
      error={error?.message}
    />
  );
};
