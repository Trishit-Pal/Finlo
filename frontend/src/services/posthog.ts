/**
 * PostHog analytics integration (free tier: 1M events/month).
 * Provides feature flags, A/B testing, and product analytics.
 *
 * Setup: Set VITE_POSTHOG_KEY in .env to enable.
 * Get a free key at https://posthog.com
 */
import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: true,
    persistence: "localStorage",
  });
  initialized = true;
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export function getFeatureFlag(flag: string): string | boolean | undefined {
  if (!POSTHOG_KEY) return undefined;
  return posthog.getFeatureFlag(flag);
}

/**
 * Get A/B test variant — returns "A" as default when PostHog is not configured.
 */
export function getExperimentVariant(experimentName: string): string {
  if (!POSTHOG_KEY) return "A";
  const flag = posthog.getFeatureFlag(experimentName);
  if (typeof flag === "string") return flag;
  return flag ? "B" : "A";
}
