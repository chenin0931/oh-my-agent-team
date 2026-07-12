"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { sanitizeNextUrl, useAuthStore } from "@ohmyagentteam/core/auth";
import { workspaceKeys } from "@ohmyagentteam/core/workspace/queries";
import { paths, resolvePostAuthDestination } from "@ohmyagentteam/core/paths";
import { api } from "@ohmyagentteam/core/api";
import { validateCliCallback, redirectToCliCallback } from "@ohmyagentteam/views/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@ohmyagentteam/ui/components/ui/card";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { Loader2 } from "lucide-react";
import { BRAND_DEEP_LINK_SCHEME, BRAND_NAME } from "@ohmyagentteam/core/brand";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const [error, setError] = useState("");
  const [desktopToken, setDesktopToken] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing authorization code");
      return;
    }

    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(errorParam === "access_denied" ? "Access denied" : errorParam);
      return;
    }

    const state = searchParams.get("state") || "";
    const stateParts = state.split(",");
    const isDesktop = stateParts.includes("platform:desktop");
    const nextPart = stateParts.find((p) => p.startsWith("next:"));
    // Strip "next:" prefix, then drop anything that isn't a safe relative path
    // so an attacker-controlled `state=next:https://evil` cannot redirect here.
    const nextUrl = sanitizeNextUrl(nextPart ? nextPart.slice(5) : null);

    // CLI callback params — carried across the Google OAuth round-trip so
    // headless/WSL2 `omat login` can receive the JWT after browser-based
    // Google auth completes.
    const cliCallbackPart = stateParts.find((p) => p.startsWith("cli_callback:"));
    const cliStatePart = stateParts.find((p) => p.startsWith("cli_state:"));
    const cliCallbackRaw = cliCallbackPart
      ? decodeURIComponent(cliCallbackPart.slice("cli_callback:".length))
      : null;
    const cliState = cliStatePart
      ? decodeURIComponent(cliStatePart.slice("cli_state:".length))
      : "";

    const redirectUri = `${window.location.origin}/auth/callback`;

    // Validate the CLI callback URL before redirecting — the state parameter
    // passes through Google OAuth and must be treated as attacker-controlled.
    const cliCallback =
      cliCallbackRaw && validateCliCallback(cliCallbackRaw)
        ? cliCallbackRaw
        : null;

    if (cliCallback) {
      // CLI login flow: exchange the Google code for a JWT, then redirect the
      // token back to the CLI's local HTTP listener (e.g. WSL2 host).
      api
        .googleLogin(code, redirectUri)
        .then(({ token }) => {
          redirectToCliCallback(cliCallback, token, cliState);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Login failed");
        });
    } else if (isDesktop) {
      // Desktop flow: exchange code for token, then redirect via deep link
      api
        .googleLogin(code, redirectUri)
        .then(({ token }) => {
          setDesktopToken(token);
          window.location.href = `${BRAND_DEEP_LINK_SCHEME}://auth/callback?token=${encodeURIComponent(token)}`;
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Login failed");
        });
    } else {
      // Normal web flow
      loginWithGoogle(code, redirectUri)
        .then(async () => {
          const wsList = await api.listWorkspaces();
          qc.setQueryData(workspaceKeys.list(), wsList);

          // 1. nextUrl wins: a `next=/invite/<id>` always survives the OAuth
          //    round-trip — the user clicked a specific link and we should
          //    honor exactly that destination.
          if (nextUrl) {
            router.push(nextUrl);
            return;
          }

          // 2. A user without a workspace may already have pending invites.
          //    Surface those before asking them to create a workspace. Users
          //    who already have a workspace see later invites in the sidebar.
          if (wsList.length === 0) {
            try {
              const invites = await api.listMyInvitations();
              if (invites.length > 0) {
                qc.setQueryData(workspaceKeys.myInvitations(), invites);
                router.push(paths.invitations());
                return;
              }
            } catch {
              // Network blip on the invite lookup is non-fatal — fall through
              // to the normal post-auth destination so the user isn't stuck
              // on a blank callback screen. Worst case they land on
              // workspace creation and the sidebar can surface invites later.
            }
          }

          // 3. Default: enter the first workspace or create one.
          router.push(resolvePostAuthDestination(wsList));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Login failed");
        });
    }
  }, [searchParams, loginWithGoogle, router, qc]);

  if (desktopToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-2xl">Opening {BRAND_NAME}</CardTitle>
            <CardDescription>
              You should see a prompt to open the {BRAND_NAME} desktop app. If
              nothing happens, click the button below.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = `${BRAND_DEEP_LINK_SCHEME}://auth/callback?token=${encodeURIComponent(desktopToken)}`;
              }}
            >
              Open {BRAND_NAME} Desktop
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Login Failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <a href={paths.login()} className="text-primary underline-offset-4 hover:underline">
              Back to login
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Signing in...</CardTitle>
          <CardDescription>Please wait while we complete your login</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}
