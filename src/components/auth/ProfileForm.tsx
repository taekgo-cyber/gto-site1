"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError, SuccessMessage } from "./FormMessage";

type ProfileFormProps = {
  user: {
    name: string;
    nickname: string | null;
    phone: string | null;
  };
};

export function ProfileForm({ user }: ProfileFormProps) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" defaultValue={user.name} required />
        <FieldError message={state?.fieldErrors?.name} />
      </div>

      <div>
        <Label htmlFor="nickname">닉네임</Label>
        <Input
          id="nickname"
          name="nickname"
          defaultValue={user.nickname ?? ""}
          required
        />
        <FieldError message={state?.fieldErrors?.nickname} />
      </div>

      <div>
        <Label htmlFor="phone">전화번호</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={user.phone ?? ""}
        />
        <FieldError message={state?.fieldErrors?.phone} />
      </div>

      <SuccessMessage message={state?.message} />

      <Button type="submit" disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
