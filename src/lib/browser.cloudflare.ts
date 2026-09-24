import { env } from "cloudflare:workers";
import { launch } from "@cloudflare/playwright";
export type { Browser, Page } from "@cloudflare/playwright";
export function launchBrowser() { return launch(env.BROWSER); }
