import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { getAuthConfig } from "@/auth.config";

const { auth } = NextAuth(getAuthConfig());

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isProtectedAppPath(pathname: string): boolean {
  return (
    pathname.startsWith("/w/") ||
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/api/me") ||
    pathname.startsWith("/api/workspaces")
  );
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isLoggedIn = !!request.auth;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (!isLoggedIn && isProtectedAppPath(pathname) && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/workspaces", request.url));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
