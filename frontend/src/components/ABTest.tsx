import type { ReactNode } from 'react';
import { useExperiment } from '../context/ABTestContext';

interface ExperimentProps {
  name: string;
  children: ReactNode;
}

interface VariantProps {
  name: string;
  children: ReactNode;
}

/**
 * A semantic wrapper for rendering variations based on the current experiment.
 */
export const Experiment = ({ name, children }: ExperimentProps) => {
  const activeVariant = useExperiment(name);
  let defaultVariant: ReactNode = null;
  let selectedVariant: ReactNode = null;

  // Determine which child component is the winning variation
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child.props && child.props.name) {
        if (child.props.name === activeVariant) {
          selectedVariant = child;
        }
        if (child.props.name === 'A') {
          defaultVariant = child;
        }
      }
    }
  } else {
      // @ts-ignore
    if (children && children.props && children.props.name === activeVariant) {
      selectedVariant = children;
    }
  }

  // Fallback to variant A if the randomized variant wasn't provided safely in the children
  return <>{selectedVariant || defaultVariant}</>;
};

export const Variant = ({ children }: VariantProps) => {
  return <>{children}</>;
};
