import { SignIn } from "@clerk/react";
import { getLoginUrl } from "@/const";

export default function SignInPage() {
  const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || "manus").toLowerCase();

  if (authProvider !== "clerk") {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl={import.meta.env.VITE_CLERK_SIGN_UP_URL || "/sign-up"}
      />
    </div>
  );
}
