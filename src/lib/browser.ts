import { chromium } from "playwright";
export type { Browser, Page } from "playwright";
export function launchBrowser() { return chromium.launch({ headless: true }); }
