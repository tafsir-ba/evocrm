import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { getAuthConfig } from "@/auth.config";
import {
  shouldRedirectAuthenticatedAwayFromAuthPages,
  shouldRedirectUnauthenticatedToLogin,
} from "@/lib/protected-app-paths";
import { isCanonicalSessionUserId } from "@/lib/session-user-id";

const { auth } = NextAuth(getAuthConfig());

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isLoggedIn =
    !!request.auth?.user?.email &&
    isCanonicalSessionUserId(request.auth.user?.id);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (shouldRedirectUnauthenticatedToLogin(pathname, isLoggedIn)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (shouldRedirectAuthenticatedAwayFromAuthPages(pathname, isLoggedIn)) {
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
