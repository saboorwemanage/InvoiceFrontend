import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_ipvuedynagdkuiemjpib",
  dirs: ["./src/trigger"],
  maxDuration: 60,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
});
