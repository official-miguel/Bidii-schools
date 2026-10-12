import type { Metadata } from "next";
import InstallGuide from "./InstallGuide";

export const metadata: Metadata = {
  title: "Install the Bidii app",
  description: "Add Bidii to your phone, tablet or computer for offline access and notifications.",
};

/**
 * Public install page — the target of the "Get the app" links on the Bidii
 * website. A PWA can only be installed from its own origin, so the website
 * links here rather than serving a file.
 */
export default function InstallPage() {
  return <InstallGuide />;
}
