import { NextResponse, type NextRequest } from "next/server";

// Fast gate: send visitors without a session cookie to /login. The session itself is validated
// against the database in requireUser()/requireBusiness() on every dashboard request.
const SESSION_COOKIE = "fd_session";

export function proxy(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding"],
};
