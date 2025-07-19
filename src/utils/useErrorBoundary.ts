import { useState, useEffect } from "react";
import { useToast } from "react-native-toast-notifications";

export const useErrorBoundary = () => {
  const [error, setError] = useState<Error>();
  const toast = useToast();

  useEffect(() => {
    if (error) {
      toast.show(error.message, { type: "error" });
      // throw error;
    }
  }, [error]);

  return setError;
};
