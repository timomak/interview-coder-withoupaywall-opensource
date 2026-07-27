import type { HandlerDetails } from "electron"

const EXTERNAL_LINK_HOSTS = ["google.com", "supabase.co"] as const

export type WindowOpenDecision = { action: "deny" }

export function isAllowedExternalLink(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  return EXTERNAL_LINK_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  )
}

export function createWindowOpenHandler(
  openExternal: (url: string) => Promise<unknown> | unknown
): (details: Pick<HandlerDetails, "url">) => WindowOpenDecision {
  return ({ url }) => {
    try {
      if (isAllowedExternalLink(new URL(url))) {
        void Promise.resolve(openExternal(url)).catch((error: unknown) => {
          console.error("Failed to open external URL:", error)
        })
      }
    } catch (error) {
      console.error("Invalid URL in setWindowOpenHandler:", url, error)
    }

    // A renderer-initiated child BrowserWindow can paint before application
    // capture protection is applied. External links are delegated above; every
    // implicit Electron child is therefore denied.
    return { action: "deny" }
  }
}
