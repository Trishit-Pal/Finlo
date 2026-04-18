/**
 * A/B test context powered by PostHog feature flags.
 * Falls back to random 50/50 split when PostHog is not configured.
 */
import { createContext, useContext, type ReactNode } from "react";
import { getExperimentVariant, initPostHog } from "../services/posthog";

interface ABTestContextType {
  getExperimentVariant: (name: string) => string;
}

const ABTestContext = createContext<ABTestContextType | null>(null);

export const ABTestProvider = ({ children }: { children: ReactNode }) => {
  // Initialize PostHog on mount
  initPostHog();

  return (
    <ABTestContext.Provider value={{ getExperimentVariant }}>
      {children}
    </ABTestContext.Provider>
  );
};

export const useExperiment = (name: string) => {
  const context = useContext(ABTestContext);
  if (!context) {
    console.warn("useExperiment must be used within ABTestProvider");
    return "A";
  }
  return context.getExperimentVariant(name);
};
