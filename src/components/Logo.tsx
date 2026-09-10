import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  height?: number;
  width?: number;
  alt?: string;
}

/**
 * Bidii logo — automatically swaps between light and dark variants based on
 * the active theme class on <html>. The dark-safe variant (logo-dark.png)
 * uses a light fill that maintains ≥ 3:1 contrast against the dark card
 * surface (#162233). Falls back to the default logo if the dark variant is
 * missing (Req 11.6).
 */
export function Logo({ className, height = 32, width, alt = 'Bidii' }: LogoProps) {
  return (
    <>
      {/* Light-mode logo — hidden in dark mode */}
      <img
        src="/logo.png"
        alt={alt}
        height={height}
        width={width}
        className={cn('block dark:hidden', className)}
      />
      {/* Dark-mode logo — hidden in light mode */}
      <img
        src="/logo-dark.png"
        alt={alt}
        height={height}
        width={width}
        className={cn('hidden dark:block', className)}
        onError={(e) => {
          // Req 11.6: fall back to default logo if dark variant asset is missing
          console.error('[Theme] Dark-safe logo not found; falling back to default');
          (e.currentTarget as HTMLImageElement).src = '/logo.png';
        }}
      />
    </>
  );
}
