"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError, SuccessMessage } from "./FormMessage";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="currentPassword">현재 비밀번호</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError message={state?.fieldErrors?.currentPassword} />
      </div>

      <div>
        <Label htmlFor="newPassword">새 비밀번호</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={state?.fieldErrors?.newPassword} />
      </div>

      <div>
        <Label htmlFor="newPasswordConfirm">새 비밀번호 확인</Label>
        <Input
          id="newPasswordConfirm"
          name="newPasswordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={state?.fieldErrors?.newPasswordConfirm} />
      </div>

      <SuccessMessage message={state?.message} />

      <Button type="submit" disabled={pending}>
        {pending ? "변경 중..." : "비밀번호 변경"}
      </Button>
    </form>
  );
}
