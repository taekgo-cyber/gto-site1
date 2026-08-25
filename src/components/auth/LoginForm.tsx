"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError, FormError } from "./FormMessage";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          required
        />
        <FieldError message={state?.fieldErrors?.email} />
      </div>

      <div>
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError message={state?.fieldErrors?.password} />
      </div>

      <FormError message={state?.formError} />

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "로그인 중..." : "로그인"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        아직 계정이 없으신가요?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
