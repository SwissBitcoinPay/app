import { useEffect } from "react";
import { appRootUrl } from "@config";
import { Text } from "@components";
import { useNavigate, useParams } from "@components/Router";
import { Linking } from "@utils";

export const Aml = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (params.id) {
      void Linking.openURL(`${appRootUrl}/aml/${params.id}`);
    }
    navigate(-1);
  }, []);

  return null;
};
