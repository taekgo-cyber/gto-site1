"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError, FormError } from "./FormMessage";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" autoComplete="name" required />
        <FieldError message={state?.fieldErrors?.name} />
      </div>

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
        <Label htmlFor="nickname">닉네임</Label>
        <Input id="nickname" name="nickname" autoComplete="nickname" required />
        <p className="mt-1 text-xs text-muted-foreground">
          한글, 영문, 숫자, _, - (2~20자)
        </p>
        <FieldError message={state?.fieldErrors?.nickname} />
      </div>

      <div>
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          영문과 숫자를 각각 1개 이상 포함한 8자 이상
        </p>
        <FieldError message={state?.fieldErrors?.password} />
      </div>

      <div>
        <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={state?.fieldErrors?.passwordConfirm} />
      </div>

      <FormError message={state?.formError} />

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "가입 중..." : "회원가입"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
