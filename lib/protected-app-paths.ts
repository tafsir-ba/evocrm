import { isPublicPath } from "@/lib/public-paths";

/**
 * App and API paths that require a canonical authenticated session.
 * The CRM root (`/`) is included so opening the product address to sign in
 * goes to `/login` instead of rendering HomePage.
 */
export function isProtectedAppPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/w/") ||
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/me") ||
    pathname.startsWith("/api/workspaces") ||
    pathname.startsWith("/api/feedback") ||
    pathname.startsWith("/api/admin")
  );
}

export function shouldRedirectUnauthenticatedToLogin(
  pathname: string,
  isLoggedIn: boolean,
): boolean {
  return !isLoggedIn && isProtectedAppPath(pathname) && !isPublicPath(pathname);
}

export function shouldRedirectAuthenticatedAwayFromAuthPages(
  pathname: string,
  isLoggedIn: boolean,
): boolean {
  return isLoggedIn && (pathname === "/login" || pathname === "/signup");
}
