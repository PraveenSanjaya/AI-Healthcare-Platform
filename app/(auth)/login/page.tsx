import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4"
    >
      <h1 className="text-2xl font-semibold">Sign in to ClinicAssist</h1>
      <LoginForm />
    </main>
  );
}
