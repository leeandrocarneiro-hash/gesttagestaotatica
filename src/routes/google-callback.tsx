import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { finishGoogleLogin } from "@/lib/auth.functions";

export const Route = createFileRoute("/google-callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    state: typeof search.state === "string" ? search.state : "",
    error: typeof search.error === "string" ? search.error : "",
  }),
  component: GoogleCallbackPage,
});

function GoogleCallbackPage() {
  const { code, state, error } = Route.useSearch();
  const finish = useServerFn(finishGoogleLogin);
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (error) {
      toast.error("O acesso pelo Google foi cancelado ou recusado.");
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!code || !state) {
      toast.error("Retorno do Google inválido. Tente novamente.");
      navigate({ to: "/login", replace: true });
      return;
    }
    finish({ data: { code, state } })
      .then(() => {
        toast.success("Login realizado com sucesso!");
        navigate({ to: "/", replace: true });
      })
      .catch((cause) => {
        toast.error(cause instanceof Error ? cause.message : "Não foi possível concluir o login Google.");
        navigate({ to: "/login", replace: true });
      });
  }, [code, state, error, finish, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <h1 className="text-lg font-semibold">Conectando sua conta Google</h1>
        <p className="mt-2 text-sm text-muted-foreground">Aguarde enquanto validamos seu acesso ao GESTTA.</p>
      </section>
    </main>
  );
}
