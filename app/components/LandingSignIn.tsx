"use client";

import { useCallback, useState } from "react";
import SignInModal from "./SignInModal";

export default function LandingSignIn() {
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInError, setSignInError] = useState("");
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  const openSignIn = () => {
    const url = new URL(window.location.href);
    const authFailed = url.searchParams.has("authError");
    url.searchParams.delete("authError");
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setSignInError(
      authFailed
        ? "Sign-in could not be completed. Please try again."
        : "",
    );
    setSignInOpen(true);
  };

  return (
    <>
      <button
        onClick={openSignIn}
        type="button"
        className="cursor-pointer rounded bg-black p-2 px-4 text-lg font-semibold tracking-tight text-white"
      >
        Sign In
      </button>
      {signInOpen && (
        <SignInModal initialError={signInError} onClose={closeSignIn} />
      )}
    </>
  );
}
