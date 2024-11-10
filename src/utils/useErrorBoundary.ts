import { useState, useEffect } from "react";

export const useErrorBoundary = () => {
  const [error, setError] = useState(null);

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return setError;
};
