import { SignUp } from "@clerk/react";
import { getLoginUrl } from "@/const";

export default function SignUpPage() {
  const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || "manus").toLowerCase();

  if (authProvider !== "clerk") {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl={import.meta.env.VITE_CLERK_SIGN_IN_URL || "/sign-in"}
      />
    </div>
  );
}
