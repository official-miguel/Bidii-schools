"use client";

/**
 * Install guide. Uses the browser's own install prompt where one exists
 * (Chromium on Android/desktop) and step-by-step instructions everywhere
 * else — Safari and Firefox expose no install API, so on iPhone the only
 * route is Share → Add to Home Screen.
 *
 * Like /login, always light: it is reached before any theme preference.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell, CheckCircle2, Copy, Download, EllipsisVertical, Menu, PlusSquare, Share, WifiOff, Zap,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { isIOS, isStandalone } from "@/lib/push/client";
import { useInstallPrompt } from "@/lib/pwa/installPrompt";

type Platform =
  | "standalone"
  | "ios-safari"
  | "ios-other"
  | "in-app"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  | "desktop-chromium"
  | "desktop-safari"
  | "desktop-other";

function detectPlatform(): Platform {
  if (isStandalone()) return "standalone";
  const ua = navigator.userAgent;
  // Social-app webviews can't install anything; the user has to open a real browser.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|; wv\)/i.test(ua)) return "in-app";
  if (isIOS()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return "android-samsung";
    if (/Firefox/i.test(ua)) return "android-firefox";
    if (/Chrome/i.test(ua)) return "android-chrome";
    return "android-other";
  }
  if (/Edg\/|Chrome\//.test(ua) && !/OPR\//.test(ua)) return "desktop-chromium";
  if (/Safari/.test(ua) && !/Chrome|Chromium/.test(ua)) return "desktop-safari";
  return "desktop-other";
}

const iconCls = "inline h-4 w-4 align-[-3px] mx-0.5 text-teal";

const STEPS: Record<Exclude<Platform, "standalone">, React.ReactNode[]> = {
  "ios-safari": [
    <>Tap the <b>Share</b> button <Share className={iconCls} aria-label="Share" /> in Safari&apos;s toolbar. On iOS 26, tap <b>•••</b> first, then <b>Share</b>.</>,
    <>Scroll down and tap <b>Add to Home Screen</b> <PlusSquare className={iconCls} aria-hidden="true" />.</>,
    <>Tap <b>Add</b>. Bidii now opens from your Home Screen like any other app.</>,
  ],
  "ios-other": [
    <>Tap the <b>Share</b> button <Share className={iconCls} aria-label="Share" /> in the address bar.</>,
    <>Tap <b>Add to Home Screen</b>. If you don&apos;t see it, open this page in <b>Safari</b> instead.</>,
    <>Tap <b>Add</b>. Bidii now opens from your Home Screen like any other app.</>,
  ],
  "in-app": [
    <>This page is open inside another app, which can&apos;t install Bidii.</>,
    <>Tap the menu <EllipsisVertical className={iconCls} aria-hidden="true" /> and choose <b>Open in browser</b> (or copy the link below and paste it into Chrome or Safari).</>,
    <>Then follow the steps shown there.</>,
  ],
  "android-chrome": [
    <>Tap the menu <EllipsisVertical className={iconCls} aria-label="menu" /> at the top right of Chrome.</>,
    <>Tap <b>Install app</b> (or <b>Add to Home screen</b> → <b>Install</b>).</>,
    <>Bidii appears in your app drawer and on your Home screen.</>,
  ],
  "android-samsung": [
    <>Tap the menu <Menu className={iconCls} aria-label="menu" /> at the bottom right.</>,
    <>Tap <b>Add page to</b> → <b>Home screen</b>, then <b>Add</b>.</>,
    <>Bidii appears on your Home screen and in your apps.</>,
  ],
  "android-firefox": [
    <>Tap the menu <EllipsisVertical className={iconCls} aria-label="menu" />.</>,
    <>Tap <b>Install</b> (or <b>Add to Home screen</b>).</>,
    <>For the best experience, including notifications, we recommend <b>Chrome</b>.</>,
  ],
  "android-other": [
    <>Open your browser&apos;s menu.</>,
    <>Choose <b>Install app</b> or <b>Add to Home screen</b>.</>,
    <>If neither appears, open this page in <b>Chrome</b>.</>,
  ],
  "desktop-chromium": [
    <>Click the <b>install</b> icon <Download className={iconCls} aria-hidden="true" /> at the right end of the address bar.</>,
    <>Or open the browser menu and choose <b>Install Bidii</b> (Chrome: <b>Cast, save and share → Install page as app</b>).</>,
    <>Bidii opens in its own window and can be pinned to your taskbar or dock.</>,
  ],
  "desktop-safari": [
    <>In the menu bar, choose <b>File</b> → <b>Add to Dock</b>.</>,
    <>Click <b>Add</b>. Bidii opens from your Dock in its own window.</>,
    <>Requires macOS Sonoma or later; otherwise use Chrome or Edge.</>,
  ],
  "desktop-other": [
    <>This browser can&apos;t install web apps.</>,
    <>Open this page in <b>Google Chrome</b> or <b>Microsoft Edge</b> and click Install.</>,
    <>You can also keep using Bidii right here in the browser.</>,
  ],
};

const BENEFITS = [
  { Icon: Zap,     text: "Opens instantly from your Home screen, full-screen" },
  { Icon: WifiOff, text: "Pages you've opened keep working without internet" },
  { Icon: Bell,    text: "Notifications for lessons, results, fees and school news" },
];

export default function InstallGuide() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [copied, setCopied] = useState(false);
  const { canPrompt, installed, install } = useInstallPrompt();

  useEffect(() => { setPlatform(detectPlatform()); }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the URL is still visible in the address bar.
    }
  }

  const done = installed || platform === "standalone";
  const steps = platform && platform !== "standalone" ? STEPS[platform] : null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-teal-50/60 via-white to-slate-50"
      style={{ colorScheme: "light" }}
    >
      <main className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="rounded-2xl bg-teal/10 ring-1 ring-teal/20 p-4 mb-5 shadow-md">
            <Logo height={64} width={64} alt="Bidii" className="object-contain" forceBidii />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Get the Bidii app</h1>
          <p className="text-slate text-sm mt-1.5 max-w-xs">
            Install Bidii on your phone, tablet or computer. Free, no app store needed.
          </p>
        </div>

        <div className="bg-card rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/5">
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)" }} />
          <div className="p-6 sm:p-7">
            {platform === null ? (
              <div className="h-40" aria-busy="true" />
            ) : done ? (
              <div className="text-center" role="status">
                <CheckCircle2 className="mx-auto h-12 w-12 text-teal" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-semibold text-foreground">Bidii is installed</h2>
                <p className="mt-1 text-sm text-slate">
                  {platform === "standalone"
                    ? "You're using the app. Sign in and turn on notifications when asked."
                    : "Open Bidii from your Home screen or app list, sign in, and turn on notifications when asked."}
                </p>
                <Link
                  href="/login"
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-teal py-3 text-sm font-semibold text-white hover:bg-teal/90"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <>
                {canPrompt && (
                  <button
                    type="button"
                    onClick={() => { void install(); }}
                    className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal py-3.5 text-base font-semibold text-white shadow-md hover:bg-teal/90 focus:outline-none focus:ring-2 focus:ring-teal/30"
                  >
                    <Download className="h-5 w-5" aria-hidden="true" />
                    Install Bidii
                  </button>
                )}

                <h2 className="text-sm font-semibold text-foreground">
                  {canPrompt ? "Or install it manually" : "How to install"}
                </h2>
                <ol className="mt-3 space-y-3">
                  {steps?.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate leading-relaxed">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal/10 text-xs font-bold text-teal">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>

                {(platform === "in-app" || platform === "ios-other" || platform === "desktop-other") && (
                  <button
                    type="button"
                    onClick={copyLink}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-teal-50"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {copied ? "Link copied" : "Copy link"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <ul className="mt-6 space-y-2.5">
          {BENEFITS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-slate">
              <Icon className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>

        {!done && (
          <p className="mt-7 text-center text-sm text-slate">
            Prefer the browser?{" "}
            <Link href="/login" className="font-medium text-teal hover:underline">Sign in here</Link>
          </p>
        )}
      </main>
    </div>
  );
}
