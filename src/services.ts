/**
 * Service Registry for dependency injection.
 * Provides centralized access to shared services like scanners.
 * Improves testability by allowing services to be mocked.
 */

import { IStepScanner, IFeatureScanner } from "./types";
import { StepScanner } from "./stepScanner";
import { FeatureScanner } from "./featureScanner";

/**
 * Container for all application services.
 */
interface Services {
  /** Scanner for Python step definitions */
  stepScanner: IStepScanner;
  /** Scanner for feature file steps */
  featureScanner: IFeatureScanner;
}

/**
 * The active services instance.
 * Null before initialization and after disposal.
 */
let services: Services | null = null;

/**
 * Initialize all services.
 * Must be called once during extension activation.
 *
 * @returns The initialized services container
 * @throws Error if services are already initialized
 */
export function initializeServices(): Services {
  if (services) {
    throw new Error("Services already initialized. Call disposeServices() first.");
  }

  services = {
    stepScanner: new StepScanner(),
    featureScanner: new FeatureScanner(),
  };

  return services;
}

/**
 * Get the current services container.
 * Use this to access services throughout the application.
 *
 * @returns The services container
 * @throws Error if services are not initialized
 */
function getServices(): Services {
  if (!services) {
    throw new Error("Services not initialized. Call initializeServices() first.");
  }
  return services;
}

/**
 * Get the step scanner service.
 * Convenience function for accessing the step scanner.
 *
 * @returns The step scanner instance
 */
export function getStepScanner(): IStepScanner {
  return getServices().stepScanner;
}

/**
 * Get the feature scanner service.
 * Convenience function for accessing the feature scanner.
 *
 * @returns The feature scanner instance
 */
export function getFeatureScanner(): IFeatureScanner {
  return getServices().featureScanner;
}

/**
 * Dispose all services and clean up resources.
 * Call this during extension deactivation.
 */
export function disposeServices(): void {
  if (services) {
    services.stepScanner.dispose();
    services.featureScanner.dispose();
    services = null;
  }
}

