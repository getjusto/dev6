export const SERVICE_TOGGLE_LOADING_MS = 5000

export type ServiceToggleAction = "start" | "stop"
export type PendingServiceStatus = Extract<
  Dev5ServiceStatus["status"],
  "loadingOn" | "loadingOff"
>

export function getPendingServiceStatus(
  action: ServiceToggleAction,
): PendingServiceStatus {
  return action === "start" ? "loadingOn" : "loadingOff"
}

export function waitForDuration(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}
