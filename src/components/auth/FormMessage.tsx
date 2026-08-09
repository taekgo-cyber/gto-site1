import { cn } from "@/lib/utils";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600",
      )}
    >
      {message}
    </p>
  );
}

export function SuccessMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700",
      )}
    >
      {message}
    </p>
  );
}
