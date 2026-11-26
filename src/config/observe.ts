/**
 * Whether a device sends crash and performance reports to Expo Observe (src/lib/observe/) while
 * its holder has not chosen in "Settings", by the app's variant: off in the production build, the
 * most protective setting by default (privacy by default), on in the staging build, whose testers
 * are the team's; the holder can turn it on or off, a choice kept on the device. Any other
 * variant: off.
 */
export const OBSERVE_BY_DEFAULT: Readonly<Record<string, boolean>> = {
  staging: true,
  production: false
};
