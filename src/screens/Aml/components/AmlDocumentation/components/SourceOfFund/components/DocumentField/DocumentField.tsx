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
        const file = files[0];

        setIsUploading(true);

        // Le runtime WASM du backend ne parse pas le multipart : on envoie le
        // fichier en base64 JSON vers l'endpoint /v1 (le path legacy
        // /kyc-doc-upload n'est pas porté). Le backend pousse vers S3 (signé
        // SigV4 côté serveur) et renvoie l'URL de l'objet.
        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file); // "data:<mime>;base64,<data>"
        });

        const {
          data: { url }
        } = await axios.post<{ url: string }>(
          `${apiRootUrl}/v1/aml-info/document`,
          {
            invoiceId,
            documentType: document,
            filename: file.name,
            contentBase64
          },
          {
            headers: {
              "Content-Type": "application/json"
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
          setFileName(file.name);
        }
        setIsUploading(false);
      }}
      onBlur={field.onBlur}
      error={error?.message}
    />
  );
};
