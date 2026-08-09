"use client";

import { useActionState } from "react";
import { withdraw } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError } from "./FormMessage";

export function WithdrawForm() {
  const [state, action, pending] = useActionState(withdraw, undefined);

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        탈퇴 시 계정 정보는 삭제 처리되며, 작성한 게시물은 유지됩니다. 이 작업은
        되돌릴 수 없습니다.
      </p>

      <div>
        <Label htmlFor="password">비밀번호 확인</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError message={state?.fieldErrors?.password} />
      </div>

      <Button
        type="submit"
        variant="primary"
        className="bg-red-600 text-white hover:bg-red-700"
        disabled={pending}
      >
        {pending ? "처리 중..." : "회원 탈퇴"}
      </Button>
    </form>
  );
}
